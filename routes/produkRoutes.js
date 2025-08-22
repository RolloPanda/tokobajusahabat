const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const Produk = require('../models/produkModel');

const router = express.Router();

// Konfigurasi multer (upload ke memori)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * 📌 GET semua produk (dengan filter & pencarian)
 */
router.get('/', async (req, res) => {
  try {
    const { q, kategori, status } = req.query;
    const filter = {};
    if (q) filter.nama = { $regex: q, $options: 'i' };
    if (kategori) filter.kategori = kategori;
    if (status) filter.statusProduk = status;

    const produk = await Produk.find(filter)
      .select('_id nama harga kategori statusProduk stok')
      .sort({ nama: 1 });

    res.json(produk);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memuat produk' });
  }
});

/**
 * 📌 GET gambar produk
 */
router.get('/gambar/:id', async (req, res) => {
  try {
    const produk = await Produk.findById(req.params.id);
    if (!produk || !produk.gambar || !produk.gambar.full) {
      return res.status(404).send('Gambar tidak ditemukan');
    }
    res.set('Content-Type', produk.gambar.full.contentType || 'image/jpeg');
    res.send(produk.gambar.full.data);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil gambar produk' });
  }
});

/**
 * 📌 POST tambah produk baru (khusus halaman tambahproduk.html)
 */
router.post('/tambah-produk', upload.single('gambar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Gambar wajib diupload' });

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const duplikat = await Produk.findOne({ 'gambar.hash': fileHash });
    if (duplikat) return res.status(409).json({ message: 'Gambar sudah pernah diupload' });

    const thumbnailBuffer = await sharp(req.file.buffer)
      .resize({ width: 150 })
      .jpeg({ quality: 60 })
      .toBuffer();

    const fullBuffer = await sharp(req.file.buffer)
      .resize({ width: 800 })
      .jpeg({ quality: 80 })
      .toBuffer();

    let stok = req.body.stok;
    if (typeof stok === 'string') {
      try { stok = JSON.parse(stok); } catch { stok = {}; }
    }
    if (!stok || typeof stok !== 'object' || Array.isArray(stok)) stok = {};

    const produkBaru = new Produk({
      nama: req.body.nama,
      harga: parseInt(req.body.harga),
      deskripsi: req.body.deskripsi,
      kategori: req.body.kategori,
      subKategori: req.body.subKategori || null,
      statusProduk: req.body.statusProduk || null,
      berat: parseInt(req.body.berat) || 0,
      stok: stok,
      gambar: {
        thumb: { data: thumbnailBuffer, contentType: 'image/jpeg' },
        full: { data: fullBuffer, contentType: 'image/jpeg' },
        hash: fileHash
      }
    });

    await produkBaru.save();
    res.status(201).json({ message: 'Produk berhasil ditambahkan', produk: produkBaru });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menambahkan produk' });
  }
});

/**
 * 📌 PATCH update stok incremental
 */
router.patch('/:id/stock', async (req, res) => {
  try {
    let { ukuran, delta } = req.body;
    if (!ukuran) return res.status(400).json({ message: 'Field ukuran wajib diisi' });
    delta = Number(delta);
    if (isNaN(delta)) return res.status(400).json({ message: 'Delta harus number' });

    ukuran = ukuran.toUpperCase();
    const produk = await Produk.findById(req.params.id);
    if (!produk) return res.status(404).json({ message: 'Produk tidak ditemukan' });

    let currentStock = produk.stok.get(ukuran) || 0;
    let newStock = currentStock + delta;
    if (newStock < 0) newStock = 0;

    produk.stok.set(ukuran, newStock);
    produk.markModified('stok');
    await produk.save();

    res.json({ message: 'Stok berhasil diupdate', stok: Object.fromEntries(produk.stok) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal update stok' });
  }
});

/**
 * 📌 PATCH update detail produk
 */
router.patch('/:id', upload.single('gambar'), async (req, res) => {
  try {
    const produk = await Produk.findById(req.params.id);
    if (!produk) return res.status(404).json({ message: 'Produk tidak ditemukan' });

    const fields = ['nama', 'harga', 'kategori', 'subKategori', 'statusProduk', 'deskripsi', 'berat'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        produk[f] = (f === 'harga' || f === 'berat') ? parseInt(req.body[f]) : req.body[f];
      }
    });

    if (req.body.stok !== undefined) {
      let stok = req.body.stok;
      if (typeof stok === "string") {
        try { stok = JSON.parse(stok); } catch { stok = {}; }
      }
      if (typeof stok === "object" && !Array.isArray(stok)) {
        produk.stok = stok;
        produk.markModified('stok');
      }
    }

    if (req.file) {
      const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const duplikat = await Produk.findOne({ 'gambar.hash': fileHash, _id: { $ne: produk._id } });
      if (duplikat) return res.status(409).json({ message: 'Gambar sudah pernah diupload' });

      const thumbnailBuffer = await sharp(req.file.buffer)
        .resize({ width: 150 })
        .jpeg({ quality: 60 })
        .toBuffer();

      const fullBuffer = await sharp(req.file.buffer)
        .resize({ width: 800 })
        .jpeg({ quality: 80 })
        .toBuffer();

      produk.gambar = {
        thumb: { data: thumbnailBuffer, contentType: 'image/jpeg' },
        full: { data: fullBuffer, contentType: 'image/jpeg' },
        hash: fileHash
      };
    }

    await produk.save();
    res.json({ message: 'Produk berhasil diupdate', produk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal update produk' });
  }
});

/**
 * 📌 GET produk berdasarkan ID
 */
router.get('/:id', async (req, res) => {
  try {
    const produk = await Produk.findById(req.params.id);
    if (!produk) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    res.json(produk);
  } catch (err) {
    res.status(500).json({ message: 'Gagal memuat detail produk' });
  }
});

/**
 * 📌 DELETE produk
 */
router.delete('/:id', async (req, res) => {
  try {
    const produk = await Produk.findByIdAndDelete(req.params.id);
    if (!produk) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    res.json({ message: 'Produk dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus produk' });
  }
});

/**
 * 📌 POST restore produk
 */
router.post('/restore', async (req, res) => {
  try {
    const produk = new Produk(req.body);
    await produk.save();
    res.status(201).json({ message: 'Produk berhasil direstore', produk });
  } catch (err) {
    res.status(500).json({ message: 'Gagal restore produk' });
  }
});

module.exports = router;
