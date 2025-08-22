const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const User = require('../models/user');

// Kirim link reset password
router.post('/kirim-link', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email wajib diisi' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('Permintaan reset dari email yang tidak terdaftar:', email);
      return res.status(404).json({ message: 'Email tidak ditemukan' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const resetLink = `http://localhost:5000/ubahpassword.html?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"Toko Baju Sahabat" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Password - Toko Baju Sahabat',
      html: `
        <p>Halo,</p>
        <p>Anda baru saja meminta reset password untuk akun Anda di <b>Toko Baju Sahabat</b>.</p>
        <p>Silakan klik link berikut untuk mengganti password Anda:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p><i>Link ini hanya berlaku selama 1 jam. Jika Anda tidak merasa melakukan permintaan ini, abaikan saja email ini.</i></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email reset password berhasil dikirim ke:', email);
    res.json({ message: 'Link reset password telah dikirim ke email Anda.' });
  } catch (err) {
    console.error('❌ Gagal mengirim email reset password:', err);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengirim email' });
  }
});

// Reset password dari link
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token dan password baru wajib diisi' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // Hash password baru
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password langsung via Model update untuk hindari trigger validasi field lain
    await User.updateOne({ _id: user._id }, { password: hashedPassword });

    console.log('✅ Password berhasil diubah untuk user:', user.email);
    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    console.error('❌ Gagal reset password:', err.message);
    res.status(400).json({ message: 'Token tidak valid atau telah kedaluwarsa' });
  }
});

module.exports = router;
