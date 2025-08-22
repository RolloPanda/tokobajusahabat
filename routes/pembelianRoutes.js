const express = require('express');
const Pembelian = require('../models/pembelianModel');
const Produk = require('../models/produkModel');
const router = express.Router();

// GET: Ambil riwayat pembelian (barang masuk) + produk (nama, kategori, stok per ukuran)
router.get('/', async (req, res) => {
  try {
    // Populate agar FE bisa akses nama produk, kategori, stok per ukuran
    const pembelian = await Pembelian.find()
      .populate('produkId', 'nama kategori stok')
      .sort({ tanggal: -1 })
      .lean();
    res.json(pembelian);
  } catch (err) {
    console.error('Gagal mengambil data pembelian:', err);
    res.status(500).json({ message: 'Gagal mengambil data pembelian' });
  }
});

// POST: Catat barang masuk & update stok produk per ukuran
router.post('/', async (req, res) => {
  try {
    const { produkId, jumlah, hargaBeli, tanggal, supplier, catatan, ukuran } = req.body;
    if (!produkId || !jumlah || !hargaBeli || !tanggal || !ukuran)
      return res.status(400).json({ message: 'Data pembelian tidak lengkap (termasuk ukuran).' });

    const _jumlah = Number(jumlah);
    const _hargaBeli = Number(hargaBeli);

    if (isNaN(_jumlah) || isNaN(_hargaBeli) || _jumlah <= 0 || _hargaBeli <= 0) {
      return res.status(400).json({ message: 'Jumlah dan harga beli harus angka > 0.' });
    }

    // Hitung total otomatis
    const totalBelanja = _jumlah * _hargaBeli;

    // 1. Simpan riwayat pembelian
    const pembelian = await Pembelian.create({
      produkId,
      jumlah: _jumlah,
      hargaBeli: _hargaBeli,
      tanggal,
      supplier,
      catatan,
      ukuran, // Simpan ukuran ke DB!
      totalBelanja
    });

    // 2. Update stok produk per ukuran (Mongoose Map / Object)
    const produk = await Produk.findById(produkId);
    if (!produk) return res.status(404).json({ message: 'Produk tidak ditemukan' });

    if (typeof produk.stok.set === 'function') {
      // Jika Map
      produk.stok.set(ukuran, (produk.stok.get(ukuran) || 0) + _jumlah);
    } else {
      // Jika plain object
      produk.stok[ukuran] = (produk.stok[ukuran] || 0) + _jumlah;
    }
    produk.markModified('stok');
    await produk.save();

    res.status(201).json(pembelian);
  } catch (err) {
    console.error('Gagal simpan pembelian:', err);
    res.status(500).json({ message: 'Gagal simpan pembelian', error: err.message });
  }
});

module.exports = router;
