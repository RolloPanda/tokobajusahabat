const mongoose = require("mongoose");

const pembayaranSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    namaRekening: { type: String, default: null },
    namaPenerima: { type: String, default: null },
    phone:        { type: String },

    subtotal: { type: Number },
    total:    { type: Number, required: true },

    metode: {
      type: String,
      enum: ["Transfer", "COD"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Menunggu Konfirmasi",
        "Diproses",
        "Ditolak",
        "Dikirim",
        "Sampai ke Tujuan",
        "Diterima",
        "Selesai",
        "Ajukan Retur",
        "Retur Selesai",
        "Retur Ditolak"
      ],
      default: "Menunggu Konfirmasi",
    },

    bukti: { data: Buffer, contentType: String },

    tanggal: { type: Date, default: Date.now },

    detailPesanan: {
      provinsi: { type: String },
      kota:     { type: String },
      kurir:    { type: String },
      alamat:   { type: String },
      ongkir:   { type: Number },
      resi:     { type: String, default: null },
    },

    diprosesAt:      { type: Date, default: null },
    dikirimAt:       { type: Date, default: null },
    sampaiAt:        { type: Date, default: null },
    diterimaAt:      { type: Date, default: null },
    selesaiAt:       { type: Date, default: null },
    returAt:         { type: Date, default: null },
    returSelesaiAt:  { type: Date, default: null },
    returDitolakAt:  { type: Date, default: null },

    items: [
      {
        nama:      { type: String },
        jumlah:    { type: Number },
        harga:     { type: Number },
        berat:     { type: Number },
        produkId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Produk",
        },
        ukuran: { type: String, required: true },
      },
    ],

    // ===== Kolom Retur =====
    retur: {
      status: {
        type: String,
        enum: [
          "Menunggu Konfirmasi",
          "Diproses",
          "Diterima",
          "Ditolak",
          "Selesai"
        ],
        default: null
      },
      alasan:      { type: String, default: null },
      deskripsi:   { type: String, default: null },
      bukti: {
        data: Buffer,
        contentType: String
      },
      bank:        { type: String, default: null },
      rekening:    { type: String, default: null },
      pemilik:     { type: String, default: null },
      keterangan:  { type: String, default: null },
      createdAt:   { type: Date,   default: null },
      updatedAt:   { type: Date,   default: null },

      // **Tambah array items untuk detail produk retur termasuk ukuran**
      items: [
        {
          nama:    { type: String },
          jumlah:  { type: Number },
          harga:   { type: Number },
          berat:   { type: Number },
          ukuran:  { type: String },
          produkId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Produk"
          }
        }
      ],

      shipmentAwb:    { type: String, default: null },
      shipmentKurir:  { type: String, default: null },
      shipmentOngkir: { type: Number, default: null },
      shipmentOngkirFixed: { type: Boolean, default: false },
      refundAmount: { type: Number, default: null },
      refundProof: {
        data: Buffer,
        contentType: String
      },
      refundAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

// === DEBUG ENUM STATUS (muncul di terminal setiap server jalan) ===
console.log("[MODEL] ENUM STATUS AKTIF:", pembayaranSchema.path('status').enumValues);

// Middleware otomatis set tanggal-tanggal saat status berubah
pembayaranSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    switch (this.status) {
      case "Diproses":        this.diprosesAt      = Date.now(); break;
      case "Dikirim":         this.dikirimAt       = Date.now(); break;
      case "Sampai ke Tujuan":this.sampaiAt        = Date.now(); break;
      case "Diterima":        this.diterimaAt      = Date.now(); break;
      case "Selesai":         this.selesaiAt       = Date.now(); break;
      case "Ajukan Retur":    this.returAt         = Date.now(); break;
      case "Retur Selesai":   this.returSelesaiAt  = Date.now(); break;
      case "Retur Ditolak":   this.returDitolakAt  = Date.now(); break;
    }
  }
  if (this.isModified("retur.status")) {
    const now = Date.now();
    if (!this.retur.createdAt) this.retur.createdAt = now;
    this.retur.updatedAt = now;
  }
  next();
});

module.exports = mongoose.model("Pembayaran", pembayaranSchema);
