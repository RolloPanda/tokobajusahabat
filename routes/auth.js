const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const User = require('../models/user');

const router = express.Router();

// ✅ REGISTER
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email sudah terdaftar' });

    const newUser = new User({ name, email, password }); // hashing ada di model
    await newUser.save();

    res.status(201).json({ message: 'Akun berhasil dibuat' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// ✅ LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Email atau kata sandi salah' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Email atau kata sandi salah' });

    res.status(200).json({
      message: 'Login berhasil',
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// ✅ UBAH PASSWORD
router.post('/ubahpassword', async (req, res) => {
  const { email, passwordLama, passwordBaru } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'User tidak ditemukan' });

    // Bandingkan password lama dengan yang ada di database
    const match = await bcrypt.compare(passwordLama, user.password);
    if (!match)
      return res.status(400).json({ message: 'Password lama salah' });

    // Simpan password baru tanpa hash manual (biar model yang hash)
    user.password = passwordBaru;
    await user.save(); // hashing terjadi otomatis di model

    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    console.error('Ubah password error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
