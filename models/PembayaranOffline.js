const mongoose = require('mongoose');

const ItemOfflineSchema = new mongoose.Schema({
  produkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produk' },
  nama: String,
  jumlah: Number,
  harga: Number,
  // --- Tambahkan field ukuran di bawah ini
  ukuran: { type: String, required: true },
  metode: String,      // Cash, Transfer
  buktiTF: {
    data: Buffer,
    contentType: String,
    originalName: String
  } // <-- Tambahkan ini
});

const PembayaranOfflineSchema = new mongoose.Schema({
  items: [ItemOfflineSchema],
  total: Number,
  kasir: String,
  tanggal: { type: Date, default: Date.now },
  catatan: String
});

module.exports = mongoose.model('PembayaranOffline', PembayaranOfflineSchema);
