const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Produk = require('../models/produkModel');

// Gabungkan produk jika sama ID+ukuran
function mergeCartItems(items) {
  const map = {};
  for (const item of items) {
    const key = item.produkId.toString() + '|' + (item.ukuran || '');
    if (map[key]) {
      map[key].jumlah += item.jumlah;
    } else {
      map[key] = { ...item };
    }
  }
  return Object.values(map);
}

// Tambah produk ke keranjang (gabung jika sama)
router.post('/tambah', async (req, res) => {
  const { email, produk } = req.body;
  if (!email || !produk || !produk._id || !produk.nama || !produk.harga) {
    return res.status(400).json({ success: false, message: 'Data produk tidak lengkap.' });
  }
  try {
    let cart = await Cart.findOne({ email });
    if (!cart) cart = new Cart({ email, items: [] });
    cart.items = cart.items.filter(item => item.nama && item.harga);

    const pid = produk._id.toString();
    const size = (produk.ukuran || "").toString();

    const existingItem = cart.items.find(
      item => item.produkId.toString() === pid && (item.ukuran || "") === size
    );
    if (existingItem) {
      existingItem.jumlah += produk.jumlah || 1;
    } else {
      cart.items.push({
        produkId: produk._id,
        nama: produk.nama,
        harga: produk.harga,
        berat: produk.berat,
        jumlah: produk.jumlah || 1,
        ukuran: size
      });
    }
    cart.items = mergeCartItems(cart.items);
    await cart.save();
    res.json({ success: true, message: 'Produk ditambahkan ke keranjang.' });
  } catch (err) {
    console.error('Tambah ke keranjang error:', err);
    res.status(500).json({ success: false, message: 'Gagal menambahkan ke keranjang.' });
  }
});

// Ambil isi keranjang
router.get('/:email', async (req, res) => {
  try {
    const cart = await Cart.findOne({ email: req.params.email }).populate('items.produkId');
    if (!cart || !Array.isArray(cart.items)) return res.json([]);
    cart.items = mergeCartItems(cart.items);
    await cart.save();

    const items = cart.items.map(item => ({
      produkId: item.produkId?._id || item.produkId,
      nama: item.nama,
      harga: item.harga,
      jumlah: item.jumlah,
      berat: item.produkId?.berat || item.berat || 0,
      ukuran: item.ukuran || "",
      ukuranAvailable: item.produkId?.ukuranAvailable || []
    }));

    res.json(items);
  } catch (err) {
    console.error('Ambil keranjang error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Hapus produk DENGAN ukuran
router.delete('/hapus/:email/:produkId/:ukuran', async (req, res) => {
  const { email, produkId, ukuran } = req.params;
  try {
    const cart = await Cart.findOne({ email });
    if (!cart) return res.status(404).json({ message: 'Keranjang tidak ditemukan' });

    cart.items = cart.items.filter(
      item => !(item.produkId.toString() === produkId && (item.ukuran || "") === ukuran)
    );
    cart.items = mergeCartItems(cart.items);
    await cart.save();

    res.json({ success: true, message: 'Produk berhasil dihapus dari keranjang' });
  } catch (err) {
    console.error('Hapus produk error:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus produk dari keranjang' });
  }
});

// Hapus produk TANPA ukuran
router.delete('/hapus/:email/:produkId', async (req, res) => {
  const { email, produkId } = req.params;
  try {
    const cart = await Cart.findOne({ email });
    if (!cart) return res.status(404).json({ message: 'Keranjang tidak ditemukan' });

    cart.items = cart.items.filter(
      item => !(item.produkId.toString() === produkId && !(item.ukuran || ""))
    );
    cart.items = mergeCartItems(cart.items);
    await cart.save();

    res.json({ success: true, message: 'Produk berhasil dihapus dari keranjang' });
  } catch (err) {
    console.error('Hapus produk error:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus produk dari keranjang' });
  }
});

// Update jumlah item di keranjang (gabung jika duplikat)
router.put('/update/:email/:produkId/:ukuran', async (req, res) => {
  const { email, produkId, ukuran } = req.params;
  const { jumlah } = req.body;
  try {
    const cart = await Cart.findOne({ email });
    if (!cart) return res.status(404).json({ message: 'Keranjang tidak ditemukan' });

    const item = cart.items.find(
      item => item.produkId.toString() === produkId && (item.ukuran || "") === (ukuran || "")
    );
    if (!item) return res.status(404).json({ message: 'Produk tidak ditemukan di keranjang' });

    item.jumlah = jumlah;
    cart.items = mergeCartItems(cart.items);

    await cart.save();

    res.json({ success: true, message: 'Jumlah produk diperbarui', item });
  } catch (err) {
    console.error('Update jumlah error:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui jumlah' });
  }
});

// Jumlah total item
router.get('/jumlah/:email', async (req, res) => {
  try {
    const cart = await Cart.findOne({ email: req.params.email });
    const totalItem = cart && Array.isArray(cart.items)
      ? cart.items.reduce((sum, item) => sum + item.jumlah, 0)
      : 0;
    res.json({ totalItem });
  } catch (err) {
    res.status(500).json({ totalItem: 0 });
  }
});

module.exports = router;
