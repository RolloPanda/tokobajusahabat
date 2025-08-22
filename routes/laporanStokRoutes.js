const express = require('express');
const router = express.Router();
const Produk = require('../models/produkModel');

router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      kategori = '',
      stokMin,
      stokMax,
      hargaMin,
      hargaMax,
    } = req.query;

    const filter = {};

    if (search.trim()) {
      filter.nama = { $regex: search.trim(), $options: 'i' };
    }
    if (kategori.trim()) {
      filter.kategori = kategori.trim();
    }
    if (hargaMin !== undefined || hargaMax !== undefined) {
      filter.harga = {};
      if (hargaMin !== undefined) filter.harga.$gte = Number(hargaMin);
      if (hargaMax !== undefined) filter.harga.$lte = Number(hargaMax);
      if (Object.keys(filter.harga).length === 0) delete filter.harga;
    }
    if (stokMin !== undefined || stokMax !== undefined) {
      filter.stok = {};
      if (stokMin !== undefined) filter.stok.$gte = Number(stokMin);
      if (stokMax !== undefined) filter.stok.$lte = Number(stokMax);
      if (Object.keys(filter.stok).length === 0) delete filter.stok;
    }

    let produkList = await Produk.find(filter).lean();

    produkList = produkList.map(p => {
      let statusStok = 'Aman'; // default hijau
      if (p.stok <= 0) statusStok = 'Habis'; // merah
      else if (p.stok < 40) statusStok = 'Kritis'; // merah (kurang dari 40)
      else if (p.stok >= 40 && p.stok < 70) statusStok = 'Menipis'; // kuning
      else if (p.stok >= 70) statusStok = 'Aman'; // hijau

      return { ...p, statusStok };
    });

    res.json({ success: true, data: produkList });
  } catch (error) {
    console.error('Error ambil laporan stok:', error);
    res.status(500).json({ success: false, message: 'Gagal ambil laporan stok' });
  }
});

module.exports = router;
