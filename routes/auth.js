const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');

router.get('/login', (req, res) => {
  res.render('login');
});


router.get('/register', (req, res) => {
  res.render('register');
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    
    if (!user) {
      return res.render('login', { error: 'Email atau password salah' });
    }
    
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: 'Email atau password salah' });
    }
    
    
    req.session.userId = user.id;
    req.session.userName = user.name;
    
    
    res.redirect('/');
    
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});


router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirm_password } = req.body;
    
    
    if (!name || !email || !password) {
      return res.render('register', { error: 'Semua field harus diisi' });
    }
    
    if (password !== confirm_password) {
      return res.render('register', { error: 'Password tidak cocok' });
    }
    
    
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.render('register', { error: 'Email sudah terdaftar' });
    }
    
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
   
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hashedPassword]
    );
    
    
    req.session.userId = newUser.rows[0].id;
    req.session.userName = newUser.rows[0].name;
    
    
    res.redirect('/');
    
  } catch (error) {
    console.error('Register error:', error);
    res.render('register', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});

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