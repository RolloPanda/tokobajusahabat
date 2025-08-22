const express    = require("express");
const mongoose   = require("mongoose");
const router     = express.Router();
const multer     = require("multer");
const Pembayaran = require("../models/Pembayaran");
const Produk     = require("../models/produkModel");

const storage = multer.memoryStorage();
const upload  = multer({ storage });

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ======================= LIST & DETAIL PESANAN =======================

router.get("/", async (req, res) => {
  try {
    let { status, start, end, page = 1, limit = 20 } = req.query;
    page  = parseInt(page, 10)  || 1;
    limit = parseInt(limit, 10) || 20;
    const filter = {};

    if (status?.trim()) {
      const arr = status.split(",").map(s => s.trim()).filter(Boolean);
      if (arr.length) filter.status = { $in: arr };
    }
    if (start) {
      const d = new Date(start); d.setHours(0,0,0,0);
      filter.tanggal = { ...(filter.tanggal||{}), $gte: d };
    }
    if (end) {
      const d = new Date(end); d.setHours(23,59,59,999);
      filter.tanggal = { ...(filter.tanggal||{}), $lte: d };
    }

    const total = await Pembayaran.countDocuments(filter);
    const data = await Pembayaran.find(filter)
      .sort({ tanggal: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select([
        "email","namaPenerima","metode","status","total","tanggal",
        "diprosesAt","dikirimAt","sampaiAt","diterimaAt","selesaiAt",
        "returAt","returSelesaiAt","returDitolakAt",
        "detailPesanan.resi","items","retur"
      ])
      .lean();

    res.json({
      success: true,
      data,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (err) {
    console.error("Admin ambil pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  try {
    const pesanan = await Pembayaran.findById(id).lean();
    if (!pesanan) {
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    }
    res.json({ success: true, pesanan });
  } catch (err) {
    console.error("Admin ambil detail pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil detail pesanan" });
  }
});

// SERVE GAMBAR BUKTI RETUR
router.get("/:id/retur/bukti", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).send("ID tidak valid");
  }
  try {
    const pembayaran = await Pembayaran.findById(id).select("retur.bukti");
    if (!pembayaran?.retur?.bukti?.data) {
      return res.status(404).send("Bukti retur tidak ditemukan");
    }
    res.set("Content-Type", pembayaran.retur.bukti.contentType);
    return res.send(pembayaran.retur.bukti.data);
  } catch (err) {
    console.error("Gagal mengambil bukti retur:", err);
    res.status(500).send("Gagal mengambil bukti retur");
  }
});

// KONFIRMASI PESANAN & KURANGI STOK (per ukuran)
router.post("/:id/confirm", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  try {
    const pembayaran = await Pembayaran.findById(id);
    if (!pembayaran) {
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    }
    if (pembayaran.status !== "Menunggu Konfirmasi") {
      return res.status(400).json({ success: false, message: "Pesanan sudah diproses atau ditolak." });
    }
    const errors = [];
    for (let item of pembayaran.items) {
      if (!item.produkId || !item.ukuran) continue;
      const produk = await Produk.findById(item.produkId).select("stok nama");
      if (!produk) {
        errors.push(`Produk "${item.nama}" tidak ditemukan`);
        continue;
      }
      const stokUkuran = produk.stok?.get(item.ukuran);
      if (stokUkuran == null) {
        errors.push(`Stok ukuran "${item.ukuran}" untuk produk "${produk.nama}" tidak ditemukan`);
        continue;
      }
      if (stokUkuran < item.jumlah) {
        errors.push(`Stok ukuran "${item.ukuran}" produk "${produk.nama}" kurang (${stokUkuran}), butuh ${item.jumlah}`);
        continue;
      }
      produk.stok.set(item.ukuran, stokUkuran - item.jumlah);
      await produk.save();
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join("; ") });
    }

    pembayaran.status     = "Diproses";
    pembayaran.diprosesAt = new Date();
    pembayaran.tanggal    = new Date();
    await pembayaran.save();

    res.json({ success: true, pembayaran });
  } catch (err) {
    console.error("Admin konfirmasi pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal menandai Diproses" });
  }
});

router.patch("/:id/resi", async (req, res) => {
  const { id } = req.params;
  const { resi } = req.body;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  if (!resi?.trim()) {
    return res.status(400).json({ success: false, message: "Nomor resi wajib diisi" });
  }
  try {
    const exists = await Pembayaran.findOne({
      "detailPesanan.resi": resi.trim(),
      _id: { $ne: id }
    });
    if (exists) {
      return res.status(409).json({ success: false, message: "Nomor resi sudah dipakai" });
    }

    const pembayaran = await Pembayaran.findById(id);
    pembayaran.detailPesanan.resi = resi.trim();
    pembayaran.status             = "Dikirim";
    pembayaran.dikirimAt          = new Date();
    pembayaran.tanggal            = new Date();
    await pembayaran.save();

    res.json({ success: true, pembayaran });
  } catch (err) {
    console.error("Admin input resi error:", err);
    res.status(500).json({ success: false, message: "Gagal menyimpan resi" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  try {
    const pembayaran = await Pembayaran.findById(id);
    pembayaran.status    = "Ditolak";
    pembayaran.updatedAt = new Date();
    pembayaran.tanggal   = new Date();
    await pembayaran.save();
    res.json({ success: true, pembayaran });
  } catch (err) {
    console.error("Admin tolak pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal menolak pesanan" });
  }
});

// UPDATE STATUS RETUR ADMIN (plus kirim items retur agar ada ukuran)
router.patch("/:id/retur", async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;  // "Diproses" | "Diterima" | "Ditolak"

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  const allowed = ["Diproses", "Diterima", "Ditolak"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: "Status retur tidak valid" });
  }

  try {
    const p = await Pembayaran.findById(id);
    if (!p?.retur?.status) {
      return res.status(400).json({ success: false, message: "Belum ada pengajuan retur" });
    }
    if (!["Menunggu Konfirmasi","Diproses"].includes(p.retur.status)) {
      return res.status(400).json({
        success: false,
        message: `Retur sudah ${p.retur.status}, tidak bisa diubah lagi`
      });
    }

    p.retur.status    = status;
    p.retur.updatedAt = new Date();

    if (status === "Ditolak") {
      p.status            = "Retur Ditolak";
      p.returDitolakAt    = new Date();
    }

    // PASTIKAN TERKIRIM items di retur untuk frontend
    if (!p.retur.items && p.items) {
      p.retur.items = p.items.map(item => ({
        produkId: item.produkId,
        nama: item.nama,
        jumlah: item.jumlah,
        harga: item.harga,
        berat: item.berat,
        ukuran: item.ukuran
      }));
    }

    p.markModified('retur');
    await p.save();

    res.json({
      success: true,
      message: `Status retur diubah menjadi ${status}`,
      retur: p.retur
    });
  } catch (err) {
    console.error("Error update status retur:", err);
    res.status(500).json({ success: false, message: "Gagal mengupdate status retur" });
  }
});

// POST /retur/shipment update ongkir retur dan kunci
router.post("/:id/retur/shipment", async (req, res) => {
  const { id } = req.params;
  const { ongkir } = req.body;

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  if (ongkir == null || isNaN(Number(ongkir))) {
    return res.status(400).json({ success: false, message: "Field ongkir wajib diisi dengan benar" });
  }

  try {
    const p = await Pembayaran.findById(id);
    if (!p) {
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    }
    if (!p.retur || p.retur.status !== "Diterima") {
      return res.status(400).json({ success: false, message: "Retur belum di-ACC admin" });
    }
    if (p.retur.shipmentOngkirFixed) {
      return res.status(400).json({ success: false, message: "Ongkir sudah di-ACC, tidak bisa diubah lagi." });
    }

    p.retur.shipmentOngkir = Number(ongkir);
    p.retur.shipmentOngkirFixed = true;
    p.retur.updatedAt      = new Date();
    p.markModified('retur');
    await p.save();

    res.json({ success: true, message: "Ongkir pengiriman balik diupdate & dikunci", retur: p.retur });
  } catch (err) {
    console.error("Gagal simpan ongkir retur:", err);
    res.status(500).json({ success: false, message: "Gagal menyimpan ongkir pengiriman retur" });
  }
});

// PATCH refund retur dengan upload bukti refund
router.patch("/:id/retur/refund", upload.single("bukti"), async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }

  try {
    const p = await Pembayaran.findById(id);
    if (!p?.retur) {
      return res.status(404).json({ success: false, message: "Tidak ada retur" });
    }

    // Nominal refund = total pesanan + ongkir balik (ongkir sudah fix)
    const totalRefund = Number(p.total || 0) + Number(p.retur.shipmentOngkir || 0);

    // Debug info
    console.log("=== DEBUG REFUND ===");
    console.log("TOTAL PESANAN:", p.total);
    console.log("ONGKIR RETUR :", p.retur.shipmentOngkir);
    console.log("TOTAL REFUND :", totalRefund);
    console.log("BUKTI FILE   :", req.file);
    console.log("====================");

    p.retur.refundAmount = totalRefund;
    p.retur.refundAt = new Date();

    if (req.file) {
      p.retur.refundProof = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    p.status = "Retur Selesai";
    p.retur.status = "Selesai";
    p.retur.updatedAt = new Date();
    p.returSelesaiAt = new Date();

    p.markModified('retur');
    await p.save();

    res.json({ success: true, message: "Refund berhasil disimpan", retur: p.retur });
  } catch (err) {
    console.error("Gagal refund:", err);
    res.status(500).json({ success: false, message: "Gagal simpan refund" });
  }
});

// Serve gambar bukti refund
router.get("/:id/retur/refund/bukti", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).send("ID tidak valid");
  try {
    const p = await Pembayaran.findById(id).select("retur.refundProof");
    if (!p?.retur?.refundProof?.data) return res.status(404).send("Tidak ada bukti refund");
    res.set("Content-Type", p.retur.refundProof.contentType);
    return res.send(p.retur.refundProof.data);
  } catch (err) {
    console.error("Gagal mengambil bukti refund:", err);
    res.status(500).send("Gagal mengambil bukti refund");
  }
});

// Tandai pesanan selesai
router.patch("/:id/selesai", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  try {
    const pembayaran = await Pembayaran.findById(id);
    pembayaran.status    = "Selesai";
    pembayaran.selesaiAt = new Date();
    pembayaran.tanggal   = new Date();
    await pembayaran.save();
    res.json({ success: true, pembayaran });
  } catch (err) {
    console.error("Admin selesai pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal menandai Selesai" });
  }
});

// Tandai pesanan diterima
router.patch("/:id/diterima", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }
  try {
    const pembayaran = await Pembayaran.findById(id);
    pembayaran.status     = "Diterima";
    pembayaran.diterimaAt = new Date();
    pembayaran.tanggal    = new Date();
    await pembayaran.save();
    res.json({ success: true, pembayaran });
  } catch (err) {
    console.error("Admin diterima pesanan error:", err);
    res.status(500).json({ success: false, message: "Gagal menandai Diterima" });
  }
});

module.exports = router;
