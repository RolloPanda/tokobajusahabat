require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

const Admin = require('../models/Admin');
const Produk = require('../models/produkModel');
const Pembayaran = require('../models/Pembayaran');
const PembayaranOffline = require('../models/PembayaranOffline');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// ------------------ JWT Middleware ------------------
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Token tidak diberikan" });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("JWT Verify Error:", err);
      return res.status(403).json({ success: false, message: "Token tidak valid atau sudah kadaluarsa" });
    }
    req.admin = decoded;
    next();
  });
}

// ------------------ Test route ------------------
router.get('/test', (req, res) => {
  res.send('Admin route works!');
});

// ------------------ Register Admin ------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email dan password wajib diisi" });
    }
    const exists = await Admin.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email sudah terdaftar" });
    }
    const newAdmin = new Admin({ email, password, role: "admin" });
    await newAdmin.save();
    res.json({ success: true, message: "Admin berhasil didaftarkan" });
  } catch (error) {
    console.error("Register Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ------------------ Login Admin ------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email dan password wajib diisi" });
    }
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ success: false, message: "Email tidak ditemukan" });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Password salah" });
    }
    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      success: true,
      message: "Login berhasil",
      token,
      admin: { email: admin.email, role: admin.role }
    });
  } catch (error) {
    console.error("Login Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ------------------ Dashboard Admin (summary, AMAN untuk stok object/angka) ------------------
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const statusValid = ["Diproses", "Dikirim", "Diterima", "Selesai"];

    // Total Produk
    const totalProduk = await Produk.countDocuments();

    // Penjualan ONLINE hari ini (status valid)
    const penjualanOnline = await Pembayaran.find({
      status: { $in: statusValid },
      tanggal: { $gte: startOfDay, $lt: endOfDay }
    }).lean();

    // Penjualan OFFLINE hari ini
    const penjualanOffline = await PembayaranOffline.find({
      tanggal: { $gte: startOfDay, $lt: endOfDay }
    }).lean();

    // Subtotal ONLINE (jumlahkan total)
    let subtotalOnline = 0;
    penjualanOnline.forEach(row => {
      subtotalOnline += row.total || 0;
    });

    // Subtotal OFFLINE (jumlahkan per item)
    let subtotalOffline = 0;
    penjualanOffline.forEach(trx => {
      (trx.items || []).forEach(item => {
        subtotalOffline += (item.harga || 0) * (item.jumlah || 0);
      });
    });

    // Jumlah transaksi hari ini (online + offline)
    const penjualanHari = penjualanOnline.length + penjualanOffline.length;
    const pendapatanHari = subtotalOnline + subtotalOffline;

    // ---------- FIX: Hitung stok menipis (<40) per ukuran / per produk ----------
    const allProduk = await Produk.find().select('stok');
    let countStokMenipis = 0;
    allProduk.forEach(p => {
      if (p.stok && typeof p.stok === 'object') {
        // stok object (per size): {S: 12, M: 20, L: 55}
        Object.values(p.stok).forEach(val => {
          if (typeof val === "number" && val > 0 && val < 40) countStokMenipis++;
        });
      } else if (typeof p.stok === 'number' && p.stok > 0 && p.stok < 40) {
        // stok angka total
        countStokMenipis++;
      }
    });
    const stokMenipis = countStokMenipis;

    res.json({
      success: true,
      admin: { email: req.admin.email },
      stats: {
        totalProduk,
        penjualanHari,
        stokMenipis,
        pendapatanHari
      }
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil data dashboard" });
  }
});

// ------------------ Ganti Password Sendiri ------------------
router.post('/ubahpassword', verifyToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { passwordLama, passwordBaru } = req.body;
    if (!passwordLama || !passwordBaru) {
      return res.status(400).json({ success: false, message: "Password lama dan baru wajib diisi" });
    }
    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ success: false, message: "Admin tidak ditemukan" });
    const match = await bcrypt.compare(passwordLama, admin.password);
    if (!match) return res.status(400).json({ success: false, message: "Password lama salah" });
    admin.password = passwordBaru; // Akan auto hash
    await admin.save();
    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (err) {
    console.error("Ubah password admin error:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

module.exports = router;
