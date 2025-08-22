const express = require("express");
const router = express.Router();
const multer = require("multer");
const Pembayaran = require("../models/Pembayaran");
const Cart = require("../models/Cart");

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Simpan pesanan baru
router.post("/", async (req, res) => {
  try {
    const { email, namaPenerima, phone, metode, total, items, namaRekening, detailPesanan } = req.body;

    if (!Array.isArray(items) || items.some(i => !i.ukuran)) {
      return res.status(400).json({ success: false, message: "Setiap item harus punya ukuran." });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.harga || 0) * (item.jumlah || 0), 0);
    const ongkir = parseInt(detailPesanan?.ongkir) || 0;

    const pembayaranBaru = new Pembayaran({
      email,
      namaPenerima,
      phone,
      metode,
      subtotal,
      total: parseInt(total),
      items,
      namaRekening: metode === "Transfer" ? (namaRekening || null) : null,
      detailPesanan: {
        provinsi: detailPesanan?.provinsi || null,
        kota:     detailPesanan?.kota     || null,
        alamat:   detailPesanan?.alamat   || null,
        ongkir,
        kurir:    detailPesanan?.kurir    || null,
      }
    });

    const saved = await pembayaranBaru.save();
    await Cart.findOneAndUpdate({ email }, { $set: { items: [] } });

    res.status(201).json({
      success: true,
      message: "Pesanan berhasil disimpan",
      _id: saved._id
    });
  } catch (error) {
    console.error("SIMPAN PESANAN ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan pesanan" });
  }
});

// Upload bukti transfer
router.post("/upload/:id", upload.single("bukti"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File tidak ditemukan" });
    }

    const pembayaran = await Pembayaran.findByIdAndUpdate(
      id,
      { bukti: { data: req.file.buffer, contentType: req.file.mimetype } },
      { new: true }
    );

    if (!pembayaran) {
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    }

    res.json({ success: true, message: "Bukti berhasil diunggah", pembayaran });
  } catch (error) {
    console.error("UPLOAD BUKTI ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal mengunggah bukti" });
  }
});

// Serve gambar bukti transfer
router.get("/bukti/:id", async (req, res) => {
  try {
    const pembayaran = await Pembayaran.findById(req.params.id).select("bukti");
    if (!pembayaran?.bukti?.data) {
      return res.status(404).send("Bukti transfer tidak ditemukan");
    }
    res.set("Content-Type", pembayaran.bukti.contentType);
    res.send(pembayaran.bukti.data);
  } catch (error) {
    console.error("GET BUKTI ERROR:", error);
    res.status(500).send("Gagal mengambil bukti");
  }
});

// Get riwayat pesanan by email
router.get("/user/:email", async (req, res) => {
  try {
    const data = await Pembayaran.find({ email: req.params.email }).sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error) {
    console.error("GET RIWAYAT ERROR:", error);
    res.status(500).json({ message: "Gagal mengambil data pesanan" });
  }
});

// Get status terbaru 1 pesanan by email
router.get("/status/terbaru/:email", async (req, res) => {
  try {
    const terbaru = await Pembayaran.findOne({ email: req.params.email }).sort({ createdAt: -1 }).lean();
    if (!terbaru) return res.status(404).json({ message: "Belum ada pesanan" });
    res.json(terbaru);
  } catch (error) {
    console.error("GET STATUS TERBARU ERROR:", error);
    res.status(500).json({ message: "Terjadi kesalahan saat mengambil status pesanan" });
  }
});

// Detail pesanan by ID
router.get("/:id", async (req, res) => {
  try {
    const pesanan = await Pembayaran.findById(req.params.id).lean();
    if (!pesanan) return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    res.json(pesanan);
  } catch (error) {
    console.error("DETAIL PESANAN ERROR:", error);
    res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
});

/** AJUKAN RETUR (user) */
router.post("/retur/:id", upload.single("bukti"), async (req, res) => {
  try {
    const { id } = req.params;
    const { alasan, deskripsi, bank, rekening, pemilik } = req.body;

    if (!alasan) {
      return res.status(400).json({ success: false, message: "Alasan retur wajib diisi!" });
    }

    const pembayaran = await Pembayaran.findById(id);
    if (!pembayaran) {
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    }

    if (pembayaran.retur && pembayaran.retur.status) {
      return res.status(400).json({ success: false, message: "Pengajuan retur sudah pernah dilakukan!" });
    }

    if (pembayaran.status !== "Diterima") {
      return res.status(400).json({ success: false, message: "Pesanan belum diterima, tidak bisa retur" });
    }

    // Tentukan status retur dan update status pesanan
    let statusRetur = "Menunggu Konfirmasi";
    if (pembayaran.metode && pembayaran.metode.toLowerCase() === "cod") {
      statusRetur = "Selesai";
      pembayaran.status = "Retur Selesai";
      pembayaran.returSelesaiAt = new Date();
      pembayaran.returDitolakAt = null;
    } else {
      pembayaran.status = "Ajukan Retur";
    }

    if (pembayaran.metode === "Transfer" && (!bank || !rekening || !pemilik)) {
      return res.status(400).json({ success: false, message: "Data rekening wajib diisi untuk Transfer!" });
    }

    // Simpan items yang diretur lengkap dengan ukuran dari pesanan asli
    // Ambil semua items pesanan asli
    const itemsRetur = pembayaran.items.map(item => ({
      produkId: item.produkId,
      nama: item.nama,
      jumlah: item.jumlah,
      harga: item.harga,
      berat: item.berat,
      ukuran: item.ukuran
    }));

    pembayaran.retur = {
      status: statusRetur,
      alasan,
      deskripsi: deskripsi || null,
      bank: pembayaran.metode === "Transfer" ? (bank || null) : null,
      rekening: pembayaran.metode === "Transfer" ? (rekening || null) : null,
      pemilik: pembayaran.metode === "Transfer" ? (pemilik || null) : null,
      items: itemsRetur,    // simpan detail items retur disini
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (req.file) {
      pembayaran.retur.bukti = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    pembayaran.returAt = new Date();
    await pembayaran.save();

    res.json({ success: true, message: "Pengajuan retur berhasil!", metode: pembayaran.metode, _id: pembayaran._id });
  } catch (error) {
    console.error("RETUR ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal mengajukan retur" });
  }
});

// Serve gambar bukti retur
router.get("/retur/bukti/:id", async (req, res) => {
  try {
    const pembayaran = await Pembayaran.findById(req.params.id).select("retur.bukti");
    if (!pembayaran?.retur?.bukti?.data) {
      return res.status(404).send("Bukti retur tidak ditemukan");
    }
    res.set("Content-Type", pembayaran.retur.bukti.contentType);
    res.send(pembayaran.retur.bukti.data);
  } catch (error) {
    console.error("GET BUKTI RETUR ERROR:", error);
    res.status(500).send("Gagal mengambil bukti retur");
  }
});

// Terima pesanan user
router.patch("/:id/terima", async (req, res) => {
  try {
    const pembayaran = await Pembayaran.findById(req.params.id);
    if (!pembayaran) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    if (pembayaran.status !== "Dikirim") {
      return res.status(400).json({ success: false, message: "Pesanan belum dikirim atau sudah diterima." });
    }
    pembayaran.status = "Diterima";
    pembayaran.diterimaAt = new Date();
    await pembayaran.save();
    res.json({ success: true, message: "Pesanan berhasil diterima", order: pembayaran });
  } catch (error) {
    console.error("TERIMA PESANAN ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal mengubah status pesanan" });
  }
});

// Selesaikan pesanan user
router.patch("/:id/selesai", async (req, res) => {
  try {
    const pembayaran = await Pembayaran.findById(req.params.id);
    if (!pembayaran) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
    if (pembayaran.status !== "Diterima") {
      return res.status(400).json({ success: false, message: "Status pesanan harus 'Diterima' untuk diselesaikan" });
    }
    pembayaran.status = "Selesai";
    pembayaran.selesaiAt = new Date();
    await pembayaran.save();
    res.json({ success: true, message: "Pesanan telah selesai", order: pembayaran });
  } catch (error) {
    console.error("SELESAI PESANAN ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal mengubah status pesanan" });
  }
});

// Input data pengiriman retur
router.post("/retur/:id/kirim", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { awb, kurir, ongkir } = req.body;

    if (!awb || !kurir || ongkir == null || isNaN(Number(ongkir))) {
      return res.status(400).json({ success: false, message: "Field awb, kurir, dan ongkir wajib diisi dengan benar" });
    }

    const pembayaran = await Pembayaran.findById(id);
    if (!pembayaran) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });

    if (!pembayaran.retur || pembayaran.retur.status !== "Diterima") {
      return res.status(400).json({ success: false, message: "Retur belum di-ACC admin" });
    }

    pembayaran.retur.shipmentAwb = awb;
    pembayaran.retur.shipmentKurir = kurir;
    pembayaran.retur.shipmentOngkir = Number(ongkir);
    pembayaran.retur.updatedAt = new Date();
    await pembayaran.save();

    res.json({
      success: true,
      message: "Data pengiriman retur berhasil disimpan",
      shipping: {
        shipmentAwb: pembayaran.retur.shipmentAwb,
        shipmentKurir: pembayaran.retur.shipmentKurir,
        shipmentOngkir: pembayaran.retur.shipmentOngkir,
      }
    });
  } catch (error) {
    console.error("KIRIM RETUR ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan data shipping retur" });
  }
});

// Get status retur 1 pesanan
router.get("/retur/:id", async (req, res) => {
  try {
    const pembayaran = await Pembayaran.findById(req.params.id).lean();
    if (!pembayaran?.retur?.status) {
      return res.json({ status: null });
    }
    res.json({
      status: pembayaran.retur.status,
      alasan: pembayaran.retur.alasan,
      deskripsi: pembayaran.retur.deskripsi,
      keterangan: pembayaran.retur.keterangan,
      bank: pembayaran.retur.bank,
      rekening: pembayaran.retur.rekening,
      pemilik: pembayaran.retur.pemilik,
      shipmentAwb: pembayaran.retur.shipmentAwb,
      shipmentKurir: pembayaran.retur.shipmentKurir,
      shipmentOngkir: pembayaran.retur.shipmentOngkir,
      awb: pembayaran.retur.shipmentAwb,
      kurir: pembayaran.retur.shipmentKurir,
      ongkir: pembayaran.retur.shipmentOngkir,
      createdAt: pembayaran.retur.createdAt,
      updatedAt: pembayaran.retur.updatedAt,
      // Kirim juga items retur supaya ada ukuran di detail retur
      items: pembayaran.retur.items || []
    });
  } catch (error) {
    console.error("GET STATUS RETUR ERROR:", error);
    res.status(500).json({ status: null, message: "Gagal ambil status retur" });
  }
});

module.exports = router;
