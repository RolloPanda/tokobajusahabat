const express = require('express');
const router = express.Router();
const Produk = require('../models/produkModel');
const Pembayaran = require('../models/Pembayaran');
const PembayaranOffline = require('../models/PembayaranOffline');

// ===================
// STATUS STOK PRODUK
// ===================
router.get('/stok-status', async (req, res) => {
  try {
    const produkList = await Produk.find().select('stok').lean();
    let aman = 0, menipis = 0, habis = 0;
    produkList.forEach(p => {
      if (typeof p.stok !== 'number') return;
      if (p.stok >= 70) aman++;
      else if (p.stok >= 40) menipis++;
      else habis++;
    });
    res.json({ success: true, data: { aman, menipis, habis } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data stok status' });
  }
});

// ===================
// PENJUALAN PERIODE (7 hari terakhir, PASTI sampai hari ini WIB)
// ===================
router.get('/penjualan-periode', async (req, res) => {
  try {
    // --- Kunci WIB, anti zona waktu! ---
    const now = new Date();
    const offsetMs = 7 * 60 * 60 * 1000; // offset GMT+7 (WIB)
    // Tentukan "hari ini" versi WIB
    const wib = new Date(now.getTime() + offsetMs);
    wib.setHours(0,0,0,0); // jam 00:00 WIB

    const end = new Date(wib);
    end.setHours(23,59,59,999); // jam 23:59:59 WIB

    const start = new Date(wib);
    start.setDate(wib.getDate() - 6);
    start.setHours(0,0,0,0);

    // Data ONLINE
    const online = await Pembayaran.aggregate([
      { $match: { 
          status: { $in: ['Diproses', 'Dikirim', 'Diterima', 'Selesai'] },
          tanggal: { $gte: start, $lte: end }
      }},
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$tanggal", timezone: "+07:00" }},
          total: { $sum: "$total" }
      }},
      { $sort: { _id: 1 } }
    ]);
    // Data OFFLINE
    const offline = await PembayaranOffline.aggregate([
      { $match: { tanggal: { $gte: start, $lte: end } }},
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$tanggal", timezone: "+07:00" }},
          total: { $sum: "$total" }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Labels (7 hari, versi WIB)
    let labels = [];
    for(let i=0; i<7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const labelDate = new Date(d.getTime() + offsetMs).toISOString().slice(0,10);
      labels.push(labelDate);
    }

    const onlineMap = Object.fromEntries(online.map(d => [d._id, d.total]));
    const offlineMap = Object.fromEntries(offline.map(d => [d._id, d.total]));
    const onlineData = labels.map(l => onlineMap[l] || 0);
    const offlineData = labels.map(l => offlineMap[l] || 0);

    res.json({ success: true, data: { labels, online: onlineData, offline: offlineData } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data penjualan periode' });
  }
});

// ===================
// PENJUALAN PER KATEGORI
// ===================
router.get('/penjualan-kategori', async (req, res) => {
  try {
    const kategoriLabels = ['Baju Wanita', 'Baju Pria', 'Baju Anak-anak', 'Busana Muslim'];
    const online = await Pembayaran.aggregate([
      { $match: { status: { $in: ['Diproses', 'Dikirim', 'Diterima', 'Selesai'] } } },
      { $unwind: '$items' },
      { $lookup: {
          from: 'produks',
          localField: 'items.produkId',
          foreignField: '_id',
          as: 'produkData'
        }
      },
      { $unwind: '$produkData' },
      { $group: {
          _id: '$produkData.kategori',
          total: { $sum: '$items.jumlah' }
      } }
    ]);
    const onlineMap = Object.fromEntries(online.map(x => [x._id, x.total]));
    const onlineData = kategoriLabels.map(label => onlineMap[label] || 0);

    const offline = await PembayaranOffline.aggregate([
      { $unwind: '$items' },
      { $lookup: {
          from: 'produks',
          localField: 'items.produkId',
          foreignField: '_id',
          as: 'produkData'
        }
      },
      { $unwind: '$produkData' },
      { $group: {
          _id: '$produkData.kategori',
          total: { $sum: '$items.jumlah' }
      } }
    ]);
    const offlineMap = Object.fromEntries(offline.map(x => [x._id, x.total]));
    const offlineData = kategoriLabels.map(label => offlineMap[label] || 0);

    res.json({ success: true, data: { labels: kategoriLabels, online: onlineData, offline: offlineData } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data penjualan kategori' });
  }
});

// ===================
// STATUS PESANAN
// ===================
router.get('/status-pesanan', async (req, res) => {
  try {
    const statusLabels = [
      'Menunggu Konfirmasi', 'Diproses', 'Ditolak', 'Dikirim',
      'Sampai ke Tujuan', 'Diterima', 'Selesai', 'Retur'
    ];
    const result = await Pembayaran.aggregate([
      { $group: { _id: '$status', total: { $sum: 1 } } }
    ]);
    const map = Object.fromEntries(result.map(x => [x._id, x.total]));
    const data = statusLabels.map(label => map[label] || 0);
    res.json({ success: true, data: { labels: statusLabels, values: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data status pesanan' });
  }
});

// ===================
// OMZET PER CHANNEL
// ===================
router.get('/omzet-channel', async (req, res) => {
  try {
    const online = await Pembayaran.aggregate([
      { $match: { status: { $in: ['Diproses', 'Dikirim', 'Diterima', 'Selesai'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const offline = await PembayaranOffline.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    res.json({
      success: true,
      data: {
        labels: ['Online', 'Offline'],
        values: [
          (online[0]?.total || 0),
          (offline[0]?.total || 0)
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data omzet channel' });
  }
});

// ===================
// PERPUTARAN STOK
// ===================
router.get('/perputaran-stok', async (req, res) => {
  try {
    const produkList = await Produk.find().select('nama kategori stok').lean();
    const produkMap = Object.fromEntries(produkList.map(p => [String(p._id), p]));
    const online = await Pembayaran.aggregate([
      { $match: { status: { $in: ['Diproses', 'Dikirim', 'Diterima', 'Selesai'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.produkId', terjual: { $sum: '$items.jumlah' } } }
    ]);
    const offline = await PembayaranOffline.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.produkId', terjual: { $sum: '$items.jumlah' } } }
    ]);
    const terjualMap = {};
    online.forEach(x => terjualMap[String(x._id)] = (terjualMap[String(x._id)] || 0) + x.terjual);
    offline.forEach(x => terjualMap[String(x._id)] = (terjualMap[String(x._id)] || 0) + x.terjual);

    const data = produkList.map(p => {
      const terjual = terjualMap[String(p._id)] || 0;
      const stokAwal = (p.stok || 0) + terjual;
      return {
        nama: p.nama,
        kategori: p.kategori,
        stokAwal,
        terjual,
        stokAkhir: p.stok
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil data perputaran stok' });
  }
});

// Tes endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Grafik route aktif' });
});

module.exports = router;
