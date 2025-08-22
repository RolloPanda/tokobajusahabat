require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cron = require('node-cron');

const app = express();

// Proxy trust (bagus kalau di Render/Cloudflare)
app.set('trust proxy', 1);

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

// ===== Static files =====
// Semua file di public bisa diakses langsung
app.use(express.static(path.join(__dirname, 'public')));

// ===== Healthcheck =====
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// ===== Import routes =====
const authRoutes = require('./routes/auth');
const produkRoutes = require('./routes/produkRoutes');
const cartRoutes = require('./routes/cartRoutes');
const pembayaranRoutes = require('./routes/pembayaranRoutes');
const lupaPasswordRoutes = require('./routes/lupaPassword');

const adminPembayaranRoutes = require('./routes/adminPembayaranRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pembelianRoutes = require('./routes/pembelianRoutes');
const pembayaranOfflineRoutes = require('./routes/pembayaranOfflineRoutes');
const laporanStokRoutes = require('./routes/laporanStokRoutes');
const grafikRoutes = require('./routes/grafikRoutes');

// ===== Public API =====
app.use('/api', authRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/keranjang', cartRoutes);
app.use('/api/pembayaran', pembayaranRoutes);
app.use('/api/lupa-password', lupaPasswordRoutes);
app.use('/api/pembelian', pembelianRoutes);

// ===== Admin API =====
app.use('/api/admin/pembayarans', adminPembayaranRoutes);
app.use('/api/admin/pembayaranoffline', pembayaranOfflineRoutes);
app.use('/api/admin/laporanstok', laporanStokRoutes);
app.use('/api/admin/grafik', grafikRoutes);
app.use('/api/admin', adminRoutes);

// ===== Root: kirim index.html dari public =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== DB Connection =====
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const startDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  }
};
startDB();

// ===== Cron job: auto selesai pesanan tiap 15 menit =====
const Pembayaran = require('./models/Pembayaran');
cron.schedule('*/15 * * * *', async () => {
  const now = new Date();
  const batas = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  try {
    const toAutoSelesai = await Pembayaran.updateMany(
      { status: 'Diterima', diterimaAt: { $lte: batas } },
      { $set: { status: 'Selesai', selesaiAt: new Date() } }
    );
    if (toAutoSelesai.modifiedCount > 0) {
      console.log(`🕒 AUTO-SELESAI: ${toAutoSelesai.modifiedCount} pesanan diselesaikan otomatis`);
    }
  } catch (err) {
    console.error('CRON AUTO-SELESAI ERROR:', err.message);
  }
});

// ===== 404 handler (paling akhir) =====
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan' });
});

// ===== Start server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
