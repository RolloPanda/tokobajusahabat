const mongoose = require('mongoose');   // <-- WAJIB ADA DI PALING ATAS!

const pembelianSchema = new mongoose.Schema({
  produkId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Produk', required: true },
  ukuran:      { type: String, required: true },      // <-- WAJIB!
  jumlah:      { type: Number, required: true },
  hargaBeli:   { type: Number, required: true },
  tanggal:     { type: Date, required: true },
  supplier:    { type: String },
  catatan:     { type: String },
  totalBelanja:{ type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Pembelian', pembelianSchema);
