const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  produkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Produk', 
    required: true 
  },
  nama: { 
    type: String, 
    required: true 
  },
  harga: { 
    type: Number, 
    required: true 
  },
  jumlah: { 
    type: Number, 
    default: 1,
    min: 1 // Tidak boleh 0 atau minus
  },
  berat: { 
    type: Number, 
    default: 0 
  },
  ukuran: { 
    type: String,
    default: "" // <- Sekarang opsional, tidak required!
  }
});

const cartSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true 
  },
  items: {
    type: [cartItemSchema],
    default: []  // Agar tidak undefined
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware: update updatedAt setiap kali save
cartSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Cart', cartSchema);
