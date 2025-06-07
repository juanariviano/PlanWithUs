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
import dotenv from "dotenv";
dotenv.config();

// Import file system module
import { dirname } from "path";

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public"));

// Konfigurasi session
app.use(
  session({
    secret: "plantwithus_secret_key", // Ganti dengan secret key yang lebih aman
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 jam
    },
  })
);

// Make user data available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.userId
    ? {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
      }
    : null;
  next();
});

// Pastikan folder uploads/ ada
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Koneksi Database
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

// Middleware untuk memeriksa autentikasi
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect("/login");
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
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    // Jika user tidak ditemukan
    if (!user) {
      return res.render("login.ejs", { error: "Email atau password salah" });
    }

    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render("login.ejs", { error: "Email atau password salah" });
    }

    // Set user session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;

    if (user.role === "admin") {
      return res.redirect("/admin-dashboard");
    } else {
      return res.redirect("/");
    }
  } catch (error) {
    console.error("Login error:", error);
    res.render("login.ejs", { error: "Terjadi kesalahan, silahkan coba lagi" });
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
      return res.render("register.ejs", { error: "Semua field harus diisi" });
    }

    if (password !== confirm_password) {
      return res.render("register.ejs", { error: "Password tidak cocok" });
    }

    // Cek apakah email sudah digunakan
    const existingUser = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.render("register.ejs", { error: "Email sudah terdaftar" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    // Set user session
    req.session.userId = newUser.rows[0].id;
    req.session.userName = newUser.rows[0].name;

    // Redirect ke homepage setelah register berhasil
    res.redirect("/");
  } catch (error) {
    console.error("Register error:", error);
    res.render("register.ejs", {
      error: "Terjadi kesalahan, silahkan coba lagi",
    });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect("/");
    }
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

function isAdmin(req, res, next) {
  if (req.session.userRole === "admin") {
    return next();
  }
  res.status(403).send("Access denied. Admins only.");
}

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
      max_volunteers,
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
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Try to replace the file using copyFile instead of unlink/rename
        try {
          fs.copyFileSync(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename),
            path.join(__dirname, "uploads", thumbnail.filename)
          );

          // Delete the temp file
          fs.unlinkSync(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename)
          );
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
      const needsVolunteers = volunteer_needed === "on";

      // Set max_volunteers to 0 if volunteers not needed
      const maxVolunteers = needsVolunteers ? max_volunteers || 0 : 0;

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
          maxVolunteers,
        ]
      );

      const result = await db.query(
        `SELECT COUNT(e.id)
         FROM users u
         JOIN event e ON u.id = e.user_id
         WHERE u.id = $1`,
        [req.session.userId]
      );
      const eventCount = result.rows[0].count;
      // console.log(eventCount);
      const type = "event";
      //eventCount == 1 || eventCount == 5
      if (eventCount == 1 || eventCount == 5) {
        let badgeId;
        if (eventCount == 1) {
          badgeId = 1;
        } else if (eventCount == 5) {
          badgeId = 2;
        }

        await db.query(
          `INSERT INTO user_badges (user_id, badge_id, awarded_at)
          SELECT $1, $2, NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2
          )`,
          [req.session.userId, badgeId]
        );

        const badgesResult = await db.query(
          `SELECT * FROM badges WHERE id = $1`,
          [badgeId]
        );

        const badgeData = badgesResult.rows[0];
        console.log(badgeData);

        res.render("badge.ejs", { eventCount, type, badgeData });
      } else {
        console.log("not enough");
        res.redirect("/");
      }
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

app.post("/donate", isAuthenticated, async (req, res) => {
  // Explicit check for authenticated user
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to donate",
    });
  }

  const { eventId, donationAmount } = req.body;

  // Validate donationAmount and eventId
  if (!eventId || !donationAmount || donationAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid event ID or donation amount",
    });
  }

  try {
    // Start a transaction
    await db.query("BEGIN");

    // Check if user has sufficient balance
    const balanceResult = await db.query(
      "SELECT balance FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (balanceResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const donationAmount = Number(req.body.donationAmount); // or however it's received
    const currentBalance = Number(balanceResult.rows[0].balance) || 0;

    if (currentBalance < donationAmount) {
      await db.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Insufficient balance for donation",
      });
    }

    // Insert donation record
    const donationResult = await db.query(
      `INSERT INTO donation_history (
        event_id,
        donation_amount,
        donation_date,
        user_id
      ) VALUES ($1, $2, NOW(), $3)
      RETURNING id`,
      [eventId, donationAmount, req.session.userId]
    );

    const donationId = donationResult.rows[0].id;

    // Insert transaction for donation
    await db.query(
      `INSERT INTO user_transactions (
        user_id,
        transaction_type,
        amount,
        transaction_date,
        event_id,
        donation_id,
        description
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
      [
        req.session.userId,
        "DONATION",
        -donationAmount, // Negative amount for expense
        eventId,
        donationId,
        "Donation to event",
      ]
    );

    // Update user balance
    await db.query(
      `UPDATE users 
       SET balance = COALESCE(balance, 0) - $1 
       WHERE id = $2`,
      [donationAmount, req.session.userId]
    );

    // Update event's raised_money
    const eventResult = await db.query(
      `UPDATE event 
       SET raised_money = COALESCE(raised_money, 0) + $1 
       WHERE id = $2 
       RETURNING raised_money, target_money, status`,
      [donationAmount, eventId]
    );

    if (eventResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const event = eventResult.rows[0];

    // If target reached, update status and end_date
    if (event.raised_money >= event.target_money) {
      await db.query(
        `UPDATE event 
         SET status = 'completed', 
             end_date = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [eventId]
      );
      event.status = "completed"; // Update local event object for response
    }

    await db.query("COMMIT");

    res.json({
      success: true,
      raised_money: event.raised_money,
      status: event.status,
      message: "Donation successful",
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error processing donation",
    });
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

// app.post("/events/accept/:id", isAuthenticated, async (req, res) => {
//   const eventId = req.params.id;

//   try {
//     await db.query("UPDATE event SET status = 'accepted' WHERE id = $1", [
//       eventId,
//     ]);
//     res.redirect("/admin-dashboard");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error updating event status");
//   }
// });

app.post("/events/accept/:id", isAdmin, async (req, res) => {
  const eventId = req.params.id;

  // Explicit check for authenticated user
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to process event income",
    });
  }

  try {
    // Start a transaction
    await db.query("BEGIN");

    // Verify event exists and get user_id
    const eventResult = await db.query(`SELECT * FROM event WHERE id = $1`, [
      eventId,
    ]);

    if (eventResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const event = eventResult.rows[0];
    const user_id = eventResult.user_id;

    // Check if the authenticated user is the event organizer
    // if (event.user_id !== req.session.userId) {
    //   await db.query("ROLLBACK");
    //   return res.status(403).json({
    //     success: false,
    //     message: "You are not authorized to process income for this event",
    //   });
    // }

    // Insert transaction for event income
    await db.query(
      `INSERT INTO user_transactions (
        user_id,
        transaction_type,
        amount,
        transaction_date,
        event_id,
        description
      )
      SELECT 
        user_id,
        'EVENT_INCOME',
        $1,
        NOW(),
        $2,
        'Income from event donation'
      FROM event
      WHERE id = $2`,
      [event.raised_money, eventId]
    );
    // console.log(event.raised_money)
    const amount = event.raised_money ?? 0;

    // Update user balance
    const balanceResult = await db.query(
      `UPDATE users 
       SET balance = COALESCE(balance, 0) + $1 
       WHERE id = (SELECT user_id FROM event WHERE id = $2) 
       RETURNING balance`,
      [amount, eventId]
    );

    if (balanceResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // const user = balanceResult.rows[0];

    await db.query("UPDATE event SET status = 'accepted' WHERE id = $1", [
      eventId,
    ]);

    await db.query("COMMIT");
    res.redirect("/admin-dashboard");
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Error updating event status");
  }
});

// Route untuk Melihat Riwayat Event yang Selesai (dilindungi auth)
app.get("/history", isAuthenticated, async (req, res) => {
  try {
    // Query for donation history
    const donationResult = await db.query(
      `
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
    `,
      [req.session.userId]
    );

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
    const volunteerResult = await db.query(
      `
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
    `,
      [req.session.userId]
    );

    const volunteerActivities = volunteerResult.rows;

    res.render("history.ejs", {
      historyEvents: historyEvents || [],
      volunteerActivities: volunteerActivities || [],
      userId: req.session.userId,
    });
  } catch (err) {
    console.error(err);
    // Jika terjadi error, tetap render halaman dengan array kosong
    res.render("history.ejs", {
      historyEvents: [],
      volunteerActivities: [],
      userId: req.session.userId,
    });
  }
});

// Route untuk Arsip Event yang Selesai (dilindungi auth)
app.get("/archive", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, event_name AS name, raised_money, thumbnail_photo FROM event WHERE status = 'accepted' ORDER BY id DESC"
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
      volunteerActivities: parseInt(volunteerActivitiesResult.rows[0].count),
    };

    res.render("profile.ejs", {
      user,
      userStats,
      role: req.session.userRole,
      message: req.query.message
        ? {
            type: req.query.type || "success",
            text: req.query.message,
          }
        : null,
      include_header: true,
      include_footer: true,
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
app.post("/volunteer/apply", isAuthenticated, async (req, res) => {
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
        message: "You have already applied for this event",
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
        message: "Event not found",
      });
    }

    const maxVolunteers = eventData.rows[0].max_volunteers;
    const currentCount = parseInt(volunteerCount.rows[0].count);

    if (currentCount >= maxVolunteers) {
      return res.json({
        success: false,
        message: "All volunteer positions have been filled",
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
      message: "Application submitted successfully",
    });
  } catch (err) {
    console.error("Volunteer application error:", err);
    res.status(500).json({
      success: false,
      message: "Error processing volunteer application",
    });
  }
});

// Route for getting volunteer count
app.get("/volunteer/count/:eventId", async (req, res) => {
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
        isFull: true,
      });
    }

    const maxVolunteers = eventData.rows[0].max_volunteers;
    const currentCount = parseInt(volunteerCount.rows[0].count);

    res.json({
      currentCount,
      maxCount: maxVolunteers,
      isFull: currentCount >= maxVolunteers,
    });
  } catch (err) {
    console.error("Error getting volunteer count:", err);
    res.status(500).json({
      currentCount: 0,
      maxCount: 0,
      isFull: false,
    });
  }
});

// Route for checking user volunteer status
app.get("/volunteer/status/:eventId", isAuthenticated, async (req, res) => {
  const { eventId } = req.params;

  try {
    const volunteerStatus = await db.query(
      "SELECT status FROM volunteers WHERE event_id = $1 AND user_id = $2",
      [eventId, req.session.userId]
    );

    if (volunteerStatus.rows.length === 0) {
      return res.json({
        hasApplied: false,
      });
    }

    res.json({
      hasApplied: true,
      status: volunteerStatus.rows[0].status,
    });
  } catch (err) {
    console.error("Error checking volunteer status:", err);
    res.status(500).json({
      hasApplied: false,
    });
  }
});

// Route for viewing my volunteer activities
app.get("/my-volunteer", isAuthenticated, async (req, res) => {
  try {
    const volunteerActivities = await db.query(
      `SELECT v.*, e.event_name, e.thumbnail_photo 
       FROM volunteers v 
       JOIN event e ON v.event_id = e.id 
       WHERE v.user_id = $1 
       ORDER BY v.created_at DESC`,
      [req.session.userId]
    );

    res.render("my-volunteer.ejs", {
      activities: volunteerActivities.rows,
      include_header: true,
      include_footer: true,
    });
  } catch (err) {
    console.error("Error retrieving volunteer activities:", err);
    res.status(500).send("Error retrieving volunteer activities");
  }
});

// Contoh implementasi untuk Express.js

// Mendapatkan daftar volunteer untuk suatu event
app.get("/api/volunteers/:eventId", isAuthenticated, async (req, res) => {
  const { eventId } = req.params;
  const userId = req.session.userId;

  try {
    // Periksa apakah user adalah pembuat event
    const event = await db.query(
      "SELECT * FROM event WHERE id = $1 AND user_id = $2",
      [eventId, userId]
    );

    if (event.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view volunteers for this event",
      });
    }

    // Ambil daftar volunteer untuk event ini
    const volunteers = await db.query(
      `SELECT v.id, v.name, v.email, v.phone, v.message, v.status, v.created_at 
       FROM volunteers v 
       WHERE v.event_id = $1 
       ORDER BY v.created_at DESC`,
      [eventId]
    );

    res.json({
      success: true,
      volunteers: volunteers.rows,
    });
  } catch (error) {
    console.error("Error fetching volunteers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch volunteer applications",
    });
  }
});

// Endpoint untuk memperbarui status volunteer
app.post("/api/volunteer/update-status", isAuthenticated, async (req, res) => {
  const { volunteerId, eventId, status } = req.body;
  const userId = req.session.userId;

  // Validasi input
  if (!volunteerId || !eventId || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  // Validasi status yang diizinkan
  const allowedStatuses = ["pending", "approved", "rejected", "completed"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  try {
    // Periksa apakah user adalah pembuat event
    const event = await db.query(
      "SELECT * FROM event WHERE id = $1 AND user_id = $2",
      [eventId, userId]
    );

    if (event.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to manage volunteers for this event",
      });
    }

    // Periksa apakah volunteer yang diupdate ada dan terkait dengan event yang benar
    const volunteer = await db.query(
      "SELECT * FROM volunteers WHERE id = $1 AND event_id = $2",
      [volunteerId, eventId]
    );

    if (volunteer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Volunteer application not found",
      });
    }

    // Update status volunteer
    await db.query(
      "UPDATE volunteers SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, volunteerId]
    );

    // Jika status berubah menjadi approved, tambahkan informasi contact coordinator
    if (status === "approved") {
      // Ambil email pembuat event
      const creatorEmail = await db.query(
        "SELECT email FROM users WHERE id = $1",
        [userId]
      );

      // Update coordinator_email dalam tabel volunteers
      if (creatorEmail.rows.length > 0) {
        await db.query(
          "UPDATE volunteers SET coordinator_email = $1 WHERE id = $2",
          [creatorEmail.rows[0].email, volunteerId]
        );
      }
    }

    // Kirim notifikasi email ke volunteer (implementasi opsional)
    // sendVolunteerStatusNotification(volunteer.rows[0].email, status, event.rows[0].event_name);

    res.json({
      success: true,
      message: `Volunteer status updated to ${status}`,
    });
  } catch (error) {
    console.error("Error updating volunteer status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update volunteer status",
    });
  }
});

// Endpoint untuk mendapatkan daftar event yang dibuat oleh user
app.get("/my-events-volunteers", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    const events = await db.query(
      "SELECT id, event_name FROM event WHERE user_id = $1 AND volunteer_needed = true ORDER BY id DESC",
      [userId]
    );

    res.render("volunteer-management.ejs", {
      myEvents: events.rows,
      user: {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
      },
    });
  } catch (error) {
    console.error("Error fetching my events:", error);
    res.status(500).send("Failed to load events");
  }
});

app.get("/my-events", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    const events = await db.query(
      "SELECT * FROM event WHERE user_id = $1 ORDER BY id DESC",
      [userId]
    );

    res.render("event-management.ejs", {
      events: events.rows,
      user: {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
      },
    });
  } catch (error) {
    console.error("Error fetching my events:", error);
    res.status(500).send("Failed to load events");
  }
});

//balance page
app.get("/balance", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    // Query 1: Get transaction list
    const transactionsResult = await db.query(
      `SELECT
         id AS transaction_id,
         transaction_type,
         amount,
         description,
         transaction_date
       FROM user_transactions
       WHERE user_id = $1
       ORDER BY transaction_date DESC`,
      [userId]
    );

    // Query 2: Get user balance
    const balanceResult = await db.query(
      `SELECT balance
       FROM users
       WHERE id = $1`,
      [userId]
    );

    // Check if user exists
    if (balanceResult.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    res.render("balance.ejs", {
      transactions: transactionsResult.rows,
      balance: balanceResult.rows[0].balance || 0,
      user: {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
      },
    });
  } catch (error) {
    console.error("Error fetching transactions or balance:", error);
    res.status(500).send("Failed to load transactions");
  }
});

//top up balance
app.post("/top-up", isAuthenticated, async (req, res) => {
  // Explicit check for authenticated user
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to top up",
    });
  }

  const { topUpAmount } = req.body;

  // Validate topUpAmount
  if (!topUpAmount || topUpAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid top-up amount",
    });
  }

  try {
    // Start a transaction
    await db.query("BEGIN");

    // Insert transaction for top-up
    await db.query(
      `INSERT INTO user_transactions (
        user_id,
        transaction_type,
        amount,
        transaction_date,
        description
      ) VALUES ($1, $2, $3, NOW(), $4)`,
      [req.session.userId, "TOP_UP", topUpAmount, "Top-up via bank transfer"]
    );

    // Update user balance
    const result = await db.query(
      `UPDATE users 
       SET balance = COALESCE(balance, 0) + $1 
       WHERE id = $2 
       RETURNING balance`,
      [topUpAmount, req.session.userId]
    );

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    await db.query("COMMIT");

    res.json({
      success: true,
      balance: user.balance,
      message: "Top-up successful",
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error processing top-up",
    });
  }
});

//withdraw balance
app.post("/withdraw", isAuthenticated, async (req, res) => {
  // Explicit check for authenticated user
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to withdraw",
    });
  }

  const { withdrawalAmount } = req.body;

  // Validate withdrawalAmount
  if (!withdrawalAmount || withdrawalAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid withdrawal amount",
    });
  }

  try {
    // Start a transaction
    await db.query("BEGIN");

    // Check if user has sufficient balance
    const balanceResult = await db.query(
      "SELECT balance FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (balanceResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentBalance = balanceResult.rows[0].balance || 0;

    if (currentBalance < withdrawalAmount) {
      await db.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Insufficient balance for withdrawal",
      });
    }

    // Insert transaction for withdrawal
    await db.query(
      `INSERT INTO user_transactions (
        user_id,
        transaction_type,
        amount,
        transaction_date,
        description
      ) VALUES ($1, $2, $3, NOW(), $4)`,
      [
        req.session.userId,
        "WITHDRAWAL",
        -withdrawalAmount,
        "Withdrawal to bank account",
      ]
    );

    // Update user balance
    const result = await db.query(
      `UPDATE users 
       SET balance = COALESCE(balance, 0) - $1 
       WHERE id = $2 
       RETURNING balance`,
      [withdrawalAmount, req.session.userId]
    );

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    await db.query("COMMIT");

    res.json({
      success: true,
      balance: user.balance,
      message: "Withdrawal successful",
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error processing withdrawal",
    });
  }
});

app.get("/volunteer-management", isAuthenticated, (req, res) => {
  res.redirect("/my-events-volunteers");
});

app.get("/event-management", isAuthenticated, (req, res) => {
  res.redirect("/my-events");
});

app.get("/my-badges", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT b.*, ub.awarded_at
       FROM badges b
       JOIN user_badges ub ON b.id = ub.badge_id
       WHERE ub.user_id = $1`,
      [req.session.userId]
    );

    const userBadges = result.rows;

    res.render("my-badges.ejs", { userBadges });
  } catch (error) {
    console.error("Error fetching user badges:", error);
    res.status(500).send("Something went wrong.");
  }
});

app.get("/admin-dashboard", isAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM event WHERE status = 'completed' ORDER BY id DESC"
    );
    res.render("admin.ejs", { archives: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving data from database");
  }
});

app.get("/all-badges", (req, res) => {
  res.render("all-badges.ejs", { error: null });
});

app.get("/balance", isAuthenticated, (req, res) => {
  res.render("balance.ejs");
});

app.get("/badge", (req, res) => {
  res.render("badge.ejs", { error: null });
});

// Menjalankan Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
