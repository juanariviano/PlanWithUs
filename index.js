import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { fileURLToPath } from "url";
import session from "express-session";
import bcrypt from "bcrypt";

// Import file system module
import { dirname } from 'path';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public"));

// Konfigurasi session
app.use(session({
  secret: 'plantwithus_secret_key', // Ganti dengan secret key yang lebih aman
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000 // 24 jam
  }
}));

// Make user data available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    name: req.session.userName
  } : null;
  next();
});

// Pastikan folder uploads/ ada
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Koneksi Database
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "plantwithus",
  password: "babiliar",
  port: 4000,
});

db.connect();

// Middleware untuk memeriksa autentikasi
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Konfigurasi Multer untuk Upload Thumbnail & Proposal
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Just generate the filename here, we'll handle resizing after upload
    const fileName = Date.now() + path.extname(file.originalname);
    cb(null, fileName);
  },
});

const upload = multer({ storage: storage });

// Route untuk Login
app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null });
});

// Proses Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Cari user berdasarkan email
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    // Jika user tidak ditemukan
    if (!user) {
      return res.render('login.ejs', { error: 'Email atau password salah' });
    }
    
    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login.ejs', { error: 'Email atau password salah' });
    }
    
    // Set user session
    req.session.userId = user.id;
    req.session.userName = user.name;
    
    // Redirect ke homepage setelah login berhasil
    res.redirect('/');
    
  } catch (error) {
    console.error('Login error:', error);
    res.render('login.ejs', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});

// Route untuk Register
app.get("/register", (req, res) => {
  res.render("register.ejs", { error: null });
});

// Proses Register
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirm_password } = req.body;
    
    // Validasi input dasar
    if (!name || !email || !password) {
      return res.render('register.ejs', { error: 'Semua field harus diisi' });
    }
    
    if (password !== confirm_password) {
      return res.render('register.ejs', { error: 'Password tidak cocok' });
    }
    
    // Cek apakah email sudah digunakan
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.render('register.ejs', { error: 'Email sudah terdaftar' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert new user
    const newUser = await db.query(
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
    res.render('register.ejs', { error: 'Terjadi kesalahan, silahkan coba lagi' });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// Route Utama - Menampilkan Event Aktif (dilindungi auth)
app.get("/", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM event WHERE status = 'active' ORDER BY id DESC"
    );
    res.render("index.ejs", { events: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving data from database");
  }
});

// Route untuk Membuat Event Baru (dilindungi auth)
app.get("/create", isAuthenticated, (req, res) => {
  res.render("create.ejs");
});

// **POST Request untuk Membuat Event Baru dengan Upload** (dilindungi auth)
app.post(
  "/create",
  isAuthenticated,
  upload.fields([{ name: "thumbnailphoto" }, { name: "file" }]),
  async (req, res) => {
    const { 
      eventname, 
      coordinatorname, 
      email, 
      targetmoney, 
      additionalnotes,
      volunteer_needed,
      volunteer_description,
      max_volunteers
    } = req.body;

    let thumbnailPath = null;
    let proposalPath = null;
    let proposalFileBuffer = null;

    try {
      // Handle thumbnail photo if uploaded
      if (req.files["thumbnailphoto"]) {
        const thumbnail = req.files["thumbnailphoto"][0];
        thumbnailPath = thumbnail.filename;
      
        // Process the image using sharp but save directly with the original filename
        await sharp(thumbnail.path)
          .resize(491, 493)
          .toFile(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename)
          );
      
        // Wait a moment to ensure file operations are complete
        await new Promise(resolve => setTimeout(resolve, 100));
      
        // Try to replace the file using copyFile instead of unlink/rename
        try {
          fs.copyFileSync(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename),
            path.join(__dirname, "uploads", thumbnail.filename)
          );
          
          // Delete the temp file
          fs.unlinkSync(path.join(__dirname, "uploads", "temp_" + thumbnail.filename));
        } catch (err) {
          console.error("File operation error:", err);
          // If we can't replace, just use the temp file
          thumbnailPath = "temp_" + thumbnail.filename;
        }
      }

      // Handle proposal file if uploaded
      if (req.files["file"]) {
        proposalPath = req.files["file"][0].path;
        proposalFileBuffer = fs.readFileSync(proposalPath);
      }

      // Convert volunteer_needed to boolean
      const needsVolunteers = volunteer_needed === 'on';
      
      // Set max_volunteers to 0 if volunteers not needed
      const maxVolunteers = needsVolunteers ? (max_volunteers || 0) : 0;

      // Insert into database with user_id
      await db.query(
        `INSERT INTO event (
          event_name, 
          coordinator_name, 
          email, 
          target_money, 
          proposal_file, 
          thumbnail_photo, 
          additional_notes, 
          raised_money, 
          status, 
          user_id,
          volunteer_needed,
          volunteer_description,
          max_volunteers
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active', $8, $9, $10, $11)`,
        [
          eventname,
          coordinatorname,
          email,
          targetmoney,
          proposalFileBuffer,
          thumbnailPath,
          additionalnotes,
          req.session.userId,
          needsVolunteers,
          needsVolunteers ? volunteer_description : null,
          maxVolunteers
        ]
      );

      res.redirect("/");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error processing upload and saving to database");
    }
  }
);

// Route untuk Mengunduh Proposal PDF (dilindungi auth)
app.get("/download/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT proposal_file FROM event WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("File not found");
    }

    const proposalFileBuffer = result.rows[0].proposal_file;
    res.contentType("application/pdf");
    res.send(proposalFileBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving file");
  }
});

/// Route untuk Donasi (dilindungi auth)
app.post("/donate", isAuthenticated, async (req, res) => {
  // Explicit check for authenticated user
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: "You must be logged in to donate" 
    });
  }
  
  const { eventId, donationAmount } = req.body;

  try {
    // Start a transaction
    await db.query("BEGIN");

    // Update raised_money
    const result = await db.query(
      "UPDATE event SET raised_money = COALESCE(raised_money, 0) + $1 WHERE id = $2 RETURNING *",
      [donationAmount, eventId]
    );

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const event = result.rows[0];

    // Add to donation history with user_id
    await db.query(
      "INSERT INTO donation_history (event_id, donation_amount, user_id) VALUES ($1, $2, $3)",
      [eventId, donationAmount, req.session.userId]
    );

    // If target reached, update status and end_date
    if (event.raised_money >= event.target_money) {
      await db.query(
        "UPDATE event SET status = 'completed', end_date = CURRENT_TIMESTAMP WHERE id = $1",
        [eventId]
      );
    }

    await db.query("COMMIT");

    res.json({
      success: true,
      raised_money: event.raised_money,
      status: event.status,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error updating donation" });
  }
});

// Route untuk Mengubah Status Event ke Completed (dilindungi auth)
app.post("/update-status", isAuthenticated, async (req, res) => {
  const { eventId } = req.body;

  try {
    await db.query("UPDATE event SET status = 'completed' WHERE id = $1", [
      eventId,
    ]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating event status");
  }
});

// Route untuk Melihat Riwayat Event yang Selesai (dilindungi auth)
app.get("/history", isAuthenticated, async (req, res) => {
  try {
    // Query for donation history
    const donationResult = await db.query(`
      SELECT 
        e.id,
        e.event_name,
        e.additional_notes,
        e.end_date,
        e.raised_money,
        e.target_money,
        e.thumbnail_photo,
        MIN(dh.donation_date) as first_donation_date,
        SUM(CASE WHEN dh.user_id = $1 THEN dh.donation_amount ELSE 0 END) as user_donation_amount
      FROM event e
      INNER JOIN donation_history dh ON e.id = dh.event_id
      WHERE dh.user_id = $1
      GROUP BY e.id
      ORDER BY COALESCE(e.end_date, MIN(dh.donation_date)) DESC
    `, [req.session.userId]);

    // Format dates untuk tampilan
    const historyEvents = donationResult.rows.map((event) => ({
      ...event,
      end_date: event.end_date
        ? new Date(event.end_date).toLocaleDateString("en-GB")
        : null,
      first_donation_date: event.first_donation_date
        ? new Date(event.first_donation_date).toLocaleDateString("en-GB")
        : null,
    }));

    // Query for volunteer activities
    const volunteerResult = await db.query(`
      SELECT 
        v.*,
        e.event_name,
        e.thumbnail_photo,
        e.coordinator_name,
        e.email as coordinator_email
      FROM volunteers v
      JOIN event e ON v.event_id = e.id
      WHERE v.user_id = $1
      ORDER BY v.created_at DESC
    `, [req.session.userId]);

    const volunteerActivities = volunteerResult.rows;

    res.render("history.ejs", { 
      historyEvents: historyEvents || [],
      volunteerActivities: volunteerActivities || [],
      userId: req.session.userId
    });
  } catch (err) {
    console.error(err);
    // Jika terjadi error, tetap render halaman dengan array kosong
    res.render("history.ejs", { 
      historyEvents: [],
      volunteerActivities: [],
      userId: req.session.userId
    });
  }
});

// Route untuk Arsip Event yang Selesai (dilindungi auth)
app.get("/archive", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, event_name AS name, raised_money, thumbnail_photo FROM event WHERE status = 'completed' ORDER BY id DESC"
    );
    res.render("archive.ejs", { archives: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving data from database");
  }
});

// Route for User Profile
app.get("/profile", isAuthenticated, async (req, res) => {
  try {
    // Fetch user data
    const userResult = await db.query(
      "SELECT id, name, email, created_at, bank_account FROM users WHERE id = $1",
      [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.redirect("/login");
    }
    
    const user = userResult.rows[0];
    
    // Get user statistics
    const eventsCreatedResult = await db.query(
      "SELECT COUNT(*) as count FROM event WHERE user_id = $1",
      [req.session.userId]
    );
    
    const totalDonatedResult = await db.query(
      "SELECT COALESCE(SUM(donation_amount), 0) as total FROM donation_history WHERE user_id = $1",
      [req.session.userId]
    );
    
    const volunteerActivitiesResult = await db.query(
      "SELECT COUNT(*) as count FROM volunteers WHERE user_id = $1",
      [req.session.userId]
    );
    
    const userStats = {
      eventsCreated: parseInt(eventsCreatedResult.rows[0].count),
      totalDonated: parseFloat(totalDonatedResult.rows[0].total),
      volunteerActivities: parseInt(volunteerActivitiesResult.rows[0].count)
    };
    
    res.render("profile.ejs", {
      user,
      userStats,
      message: req.query.message ? {
        type: req.query.type || 'success',
        text: req.query.message
      } : null,
      include_header: true,
      include_footer: true
    });
    
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).send("Error retrieving profile data");
  }
});

// Route for updating user profile
app.post("/profile/update", isAuthenticated, async (req, res) => {
  try {
    const { name, email, bank_account } = req.body;
    
    // Check if email exists for another user
    if (email) {
      const existingEmail = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.session.userId]
      );
      
      if (existingEmail.rows.length > 0) {
        return res.redirect("/profile?message=Email already in use&type=error");
      }
    }
    
    // Update user information
    await db.query(
      "UPDATE users SET name = $1, email = $2, bank_account = $3 WHERE id = $4",
      [name, email, bank_account, req.session.userId]
    );
    
    // Update session name if changed
    if (name !== req.session.userName) {
      req.session.userName = name;
    }
    
    res.redirect("/profile?message=Profile updated successfully");
    
  } catch (err) {
    console.error("Profile update error:", err);
    res.redirect("/profile?message=Error updating profile&type=error");
  }
});

// Route for volunteer application
app.post('/volunteer/apply', isAuthenticated, async (req, res) => {
  const { eventId, name, email, phone, message } = req.body;
  
  try {
    // Check if user already applied
    const existingApplication = await db.query(
      "SELECT * FROM volunteers WHERE event_id = $1 AND user_id = $2",
      [eventId, req.session.userId]
    );
    
    if (existingApplication.rows.length > 0) {
      return res.json({
        success: false,
        message: 'You have already applied for this event'
      });
    }
    
    // Check if max volunteers reached
    const volunteerCount = await db.query(
      "SELECT COUNT(*) as count FROM volunteers WHERE event_id = $1 AND status IN ('pending', 'approved')",
      [eventId]
    );
    
    const eventData = await db.query(
      "SELECT max_volunteers FROM event WHERE id = $1",
      [eventId]
    );
    
    if (!eventData.rows.length) {
      return res.json({
        success: false,
        message: 'Event not found'
      });
    }
    
    const maxVolunteers = eventData.rows[0].max_volunteers;
    const currentCount = parseInt(volunteerCount.rows[0].count);
    
    if (currentCount >= maxVolunteers) {
      return res.json({
        success: false,
        message: 'All volunteer positions have been filled'
      });
    }
    
    // Insert volunteer application
    await db.query(
      `INSERT INTO volunteers (event_id, user_id, name, email, phone, message, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [eventId, req.session.userId, name, email, phone, message]
    );
    
    res.json({
      success: true,
      message: 'Application submitted successfully'
    });
    
  } catch (err) {
    console.error('Volunteer application error:', err);
    res.status(500).json({
      success: false,
      message: 'Error processing volunteer application'
    });
  }
});

// Route for getting volunteer count
app.get('/volunteer/count/:eventId', async (req, res) => {
  const { eventId } = req.params;
  
  try {
    const volunteerCount = await db.query(
      "SELECT COUNT(*) as count FROM volunteers WHERE event_id = $1 AND status IN ('pending', 'approved')",
      [eventId]
    );
    
    const eventData = await db.query(
      "SELECT max_volunteers FROM event WHERE id = $1",
      [eventId]
    );
    
    if (!eventData.rows.length) {
      return res.json({
        currentCount: 0,
        maxCount: 0,
        isFull: true
      });
    }
    
    const maxVolunteers = eventData.rows[0].max_volunteers;
    const currentCount = parseInt(volunteerCount.rows[0].count);
    
    res.json({
      currentCount,
      maxCount: maxVolunteers,
      isFull: currentCount >= maxVolunteers
    });
    
  } catch (err) {
    console.error('Error getting volunteer count:', err);
    res.status(500).json({
      currentCount: 0,
      maxCount: 0,
      isFull: false
    });
  }
});

// Route for checking user volunteer status
app.get('/volunteer/status/:eventId', isAuthenticated, async (req, res) => {
  const { eventId } = req.params;
  
  try {
    const volunteerStatus = await db.query(
      "SELECT status FROM volunteers WHERE event_id = $1 AND user_id = $2",
      [eventId, req.session.userId]
    );
    
    if (volunteerStatus.rows.length === 0) {
      return res.json({
        hasApplied: false
      });
    }
    
    res.json({
      hasApplied: true,
      status: volunteerStatus.rows[0].status
    });
    
  } catch (err) {
    console.error('Error checking volunteer status:', err);
    res.status(500).json({
      hasApplied: false
    });
  }
});

// Route for viewing my volunteer activities
app.get('/my-volunteer', isAuthenticated, async (req, res) => {
  try {
    const volunteerActivities = await db.query(
      `SELECT v.*, e.event_name, e.thumbnail_photo 
       FROM volunteers v 
       JOIN event e ON v.event_id = e.id 
       WHERE v.user_id = $1 
       ORDER BY v.created_at DESC`,
      [req.session.userId]
    );
    
    res.render('my-volunteer.ejs', {
      activities: volunteerActivities.rows,
      include_header: true,
      include_footer: true
    });
    
  } catch (err) {
    console.error('Error retrieving volunteer activities:', err);
    res.status(500).send('Error retrieving volunteer activities');
  }
});

// Menjalankan Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});