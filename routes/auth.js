const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db'); // Pastikan Anda memiliki file koneksi database

// Render halaman login
router.get('/login', (req, res) => {
  res.render('login');
});

// Render halaman register
router.get('/register', (req, res) => {
  res.render('register');
});

// Handle login form submission
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Cari user berdasarkan email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    // Jika user tidak ditemukan
    if (!user) {
      return res.render('login', { error: 'Email atau password salah' });
    }
    
    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: 'Email atau password salah' });
    }
    
    // Set user session
    req.session.userId = user.id;
    req.session.userName = user.name;
    
    // Redirect ke homepage setelah login berhasil
    res.redirect('/');
    
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});

// Handle register form submission
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirm_password } = req.body;
    
    // Validasi input dasar
    if (!name || !email || !password) {
      return res.render('register', { error: 'Semua field harus diisi' });
    }
    
    if (password !== confirm_password) {
      return res.render('register', { error: 'Password tidak cocok' });
    }
    
    // Cek apakah email sudah digunakan
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.render('register', { error: 'Email sudah terdaftar' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert new user
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hashedPassword]
    );
    
    // Set user session
    req.session.userId = newUser.rows[0].id;
    req.session.userName = newUser.rows[0].name;
    
    // Redirect ke homepage setelah register berhasil
    res.redirect('/');
    
  } catch (error) {
    console.error('Register error:', error);
    res.render('register', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});

module.exports = router;