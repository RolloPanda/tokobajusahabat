const mongoose = require('mongoose');

const produkSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  harga: { type: Number, required: true },
  kategori: {
    type: String,
    required: true,
    enum: ['Baju Wanita', 'Baju Pria', 'Baju Anak-anak', 'Busana Muslim']
  },
  subKategori: {
    type: String,
    enum: ['Dress', 'Blouse', 'Tunik', 'Gamis', 'Rok & Celana'],
    required: function () {
      return this.kategori === 'Baju Wanita';
    }
  },
  statusProduk: {
    type: String,
    enum: ['Barang Baru', 'Barang Populer'],
    default: null
  },
  deskripsi: String,
  berat: Number, // dalam gram

  // <-- Ubah stok jadi Map of Numbers -->
  stok: {
    type: Map,
    of: Number,
    required: true,
    default: {}         // misal: { S:100, M:100, L:50 }
  },

  gambar: {
    thumb: {
      data: Buffer,
      contentType: String
    },
    full: {
      data: Buffer,
      contentType: String
    },
    hash: String
  }
});

module.exports = mongoose.model('Produk', produkSchema);
