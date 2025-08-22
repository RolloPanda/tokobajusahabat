const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const PembayaranOffline = require('../models/PembayaranOffline');
const Produk = require('../models/produkModel');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/admin/pembayaranoffline
 * Simpan transaksi offline (satu transaksi bisa multi produk, support transfer+cash)
 * Body: multipart/form-data, items dalam JSON, file2 buktiTF
 */
router.post('/', upload.any(), async (req, res) => {
  try {
    let items = [];
    if (typeof req.body.items === 'string') {
      items = JSON.parse(req.body.items);
    } else {
      items = req.body.items;
    }
    const { kasir, catatan } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Data transaksi kosong!" });
    }
    // Validasi ukuran
    if (items.some(i => !i.ukuran)) {
      return res.status(400).json({ success: false, message: "Setiap item harus punya ukuran!" });
    }
    // Lampirkan file ke setiap item yang Transfer
    for (let i = 0; i < items.length; i++) {
      if (items[i].metode === 'Transfer') {
        const f = req.files.find(file => file.fieldname === `buktiTF${i}`);
        if (f) {
          items[i].buktiTF = {
            data: f.buffer,
            contentType: f.mimetype,
            originalName: f.originalname
          };
        }
      }
    }

    const total = items.reduce((sum, i) => sum + (i.harga * i.jumlah), 0);

    // Simpan transaksi ke DB
    const transaksi = await PembayaranOffline.create({
      items, total, kasir, catatan
    });

    // Update stok per ukuran di setiap produk!
    for (const i of items) {
      const produk = await Produk.findById(i.produkId);
      if (produk) {
        if (typeof produk.stok.set === 'function') {
          // Mongoose Map
          produk.stok.set(i.ukuran, (produk.stok.get(i.ukuran) || 0) - i.jumlah);
        } else {
          // Object fallback
          produk.stok[i.ukuran] = (produk.stok[i.ukuran] || 0) - i.jumlah;
        }
        if (produk.stok[i.ukuran] < 0) produk.stok[i.ukuran] = 0;
        produk.markModified('stok');
        await produk.save();
      }
    }

    res.json({ success: true, transaksi });
  } catch (err) {
    console.error('Gagal simpan transaksi offline:', err);
    res.status(500).json({ success: false, message: 'Gagal simpan transaksi offline' });
  }
});

/**
 * GET /api/admin/pembayaranoffline/riwayat
 * Riwayat transaksi offline (default hari ini, atau filter by tanggal)
 */
router.get('/riwayat', async (req, res) => {
  try {
    let { start, end } = req.query;
    let filter = {};

    if (start) {
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      filter.tanggal = { $gte: startDate };
    }
    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      filter.tanggal = filter.tanggal || {};
      filter.tanggal.$lte = endDate;
    }
    // Default hari ini
    if (!start && !end) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const besok = new Date(today);
      besok.setDate(besok.getDate() + 1);
      filter.tanggal = { $gte: today, $lt: besok };
    }
    const data = await PembayaranOffline.find(filter).sort({ tanggal: -1 }).lean();
    res.json(data);
  } catch (err) {
    console.error('Gagal mengambil riwayat transaksi offline:', err);
    res.status(500).json({ message: 'Gagal mengambil riwayat transaksi offline' });
  }
});

/**
 * GET /api/admin/pembayaranoffline/:id/gambar/:idx
 * Ambil bukti transfer pada satu transaksi & item tertentu
 */
router.get('/:id/gambar/:idx', async (req, res) => {
  try {
    const { id, idx } = req.params;
    const trx = await PembayaranOffline.findById(id);
    if (!trx) return res.status(404).send('Transaksi tidak ditemukan');
    const item = trx.items[+idx];
    if (!item || !item.buktiTF || !item.buktiTF.data) return res.status(404).send('Bukti transfer tidak ditemukan');
    res.set('Content-Type', item.buktiTF.contentType || 'image/jpeg');
    res.send(item.buktiTF.data);
  } catch (err) {
    res.status(500).send('Gagal mengambil bukti transfer');
  }
});

module.exports = router;
