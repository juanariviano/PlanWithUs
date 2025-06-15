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


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);


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


const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}


const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();


function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect("/login");
}


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const fileName = Date.now() + path.extname(file.originalname);
    cb(null, fileName);
  },
});

const upload = multer({ storage: storage });


app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null });
});


app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    
    if (!user) {
      return res.render("login.ejs", { error: "Email atau password salah" });
    }

    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render("login.ejs", { error: "Email atau password salah" });
    }

    
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


app.get("/register", (req, res) => {
  res.render("register.ejs", { error: null });
});


app.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirm_password } = req.body;

    
    if (!name || !email || !password) {
      return res.render("register.ejs", { error: "Semua field harus diisi" });
    }

    if (password !== confirm_password) {
      return res.render("register.ejs", { error: "Password tidak cocok" });
    }

    
    const existingUser = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.render("register.ejs", { error: "Email sudah terdaftar" });
    }

    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    
    const newUser = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    
    req.session.userId = newUser.rows[0].id;
    req.session.userName = newUser.rows[0].name;

    
    res.redirect("/");
  } catch (error) {
    console.error("Register error:", error);
    res.render("register.ejs", {
      error: "Terjadi kesalahan, silahkan coba lagi",
    });
  }
});


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


app.get("/create", isAuthenticated, (req, res) => {
  res.render("create.ejs");
});

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
      
      if (req.files["thumbnailphoto"]) {
        const thumbnail = req.files["thumbnailphoto"][0];
        thumbnailPath = thumbnail.filename;

        
        await sharp(thumbnail.path)
          .resize(491, 493)
          .toFile(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename)
          );

        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          fs.copyFileSync(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename),
            path.join(__dirname, "uploads", thumbnail.filename)
          );

          fs.unlinkSync(
            path.join(__dirname, "uploads", "temp_" + thumbnail.filename)
          );
        } catch (err) {
          console.error("File operation error:", err);
          thumbnailPath = "temp_" + thumbnail.filename;
        }
      }

      if (req.files["file"]) {
        proposalPath = req.files["file"][0].path;
        proposalFileBuffer = fs.readFileSync(proposalPath);
      }

      const needsVolunteers = volunteer_needed === "on";

      const maxVolunteers = needsVolunteers ? max_volunteers || 0 : 0;

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
      const type = "event";
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
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to donate",
    });
  }

  const { eventId, donationAmount } = req.body;

  if (!eventId || !donationAmount || donationAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid event ID or donation amount",
    });
  }

  try {
    await db.query("BEGIN");

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

    const donationAmount = Number(req.body.donationAmount);
    const currentBalance = Number(balanceResult.rows[0].balance) || 0;

    if (currentBalance < donationAmount) {
      await db.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Insufficient balance for donation",
      });
    }

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
        -donationAmount,
        eventId,
        donationId,
        "Donation to event",
      ]
    );

    await db.query(
      `UPDATE users 
       SET balance = COALESCE(balance, 0) - $1 
       WHERE id = $2`,
      [donationAmount, req.session.userId]
    );

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

    if (event.raised_money >= event.target_money) {
      await db.query(
        `UPDATE event 
         SET status = 'completed', 
             end_date = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [eventId]
      );
      event.status = "completed";
    }

    await db.query("COMMIT");

    const result = await db.query(
      `SELECT COUNT(dh.id)
       FROM donation_history dh
       WHERE dh.user_id = $1`,
      [req.session.userId]
    );
    const donationCount = result.rows[0].count;
    let badgeId = null;
    if (donationCount == 1 || donationCount == 5) {
      if (donationCount == 1) {
        badgeId = 3;
      } else if (donationCount == 5) {
        badgeId = 4;
      }

      await db.query(
        `INSERT INTO user_badges (user_id, badge_id, awarded_at)
        SELECT $1, $2, NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2
        )`,
        [req.session.userId, badgeId]
      );

    }
    res.json({
      success: true,
      raised_money: event.raised_money,
      status: event.status,
      badge_awarded: !!badgeId,
      badge_id: badgeId,
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

  
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to process event income",
    });
  }

  try {
    
    await db.query("BEGIN");

    
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

    // if (event.user_id !== req.session.userId) {
    //   await db.query("ROLLBACK");
    //   return res.status(403).json({
    //     success: false,
    //     message: "You are not authorized to process income for this event",
    //   });
    // }

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
    const amount = event.raised_money ?? 0;

    
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

app.get("/history", isAuthenticated, async (req, res) => {
  try {
    
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

    
    const historyEvents = donationResult.rows.map((event) => ({
      ...event,
      end_date: event.end_date
        ? new Date(event.end_date).toLocaleDateString("en-GB")
        : null,
      first_donation_date: event.first_donation_date
        ? new Date(event.first_donation_date).toLocaleDateString("en-GB")
        : null,
    }));

    
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
    
    res.render("history.ejs", {
      historyEvents: [],
      volunteerActivities: [],
      userId: req.session.userId,
    });
  }
});


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


app.get("/profile", isAuthenticated, async (req, res) => {
  try {
    
    const userResult = await db.query(
      "SELECT id, name, email, created_at, bank_account FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (userResult.rows.length === 0) {
      return res.redirect("/login");
    }

    const user = userResult.rows[0];

    
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


app.post("/profile/update", isAuthenticated, async (req, res) => {
  try {
    const { name, email, bank_account } = req.body;

    if (email) {
      const existingEmail = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.session.userId]
      );

      if (existingEmail.rows.length > 0) {
        return res.redirect("/profile?message=Email already in use&type=error");
      }
    }

  
    await db.query(
      "UPDATE users SET name = $1, email = $2, bank_account = $3 WHERE id = $4",
      [name, email, bank_account, req.session.userId]
    );


    if (name !== req.session.userName) {
      req.session.userName = name;
    }

    res.redirect("/profile?message=Profile updated successfully");
  } catch (err) {
    console.error("Profile update error:", err);
    res.redirect("/profile?message=Error updating profile&type=error");
  }
});


app.post("/volunteer/apply", isAuthenticated, async (req, res) => {
  const { eventId, name, email, phone, message } = req.body;

  try {
  
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

   
    await db.query(
      `INSERT INTO volunteers (event_id, user_id, name, email, phone, message, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [eventId, req.session.userId, name, email, phone, message]
    );

    const result = await db.query(
      `SELECT COUNT(v.id)
       FROM volunteers v
       WHERE v.user_id = $1`,
      [req.session.userId]
    );
    const volunteerAmount = result.rows[0].count;
    let badgeId = null;
    if (volunteerAmount == 1 || volunteerAmount == 5) {
      if (volunteerAmount == 1) {
        badgeId = 5;
      } else if (volunteerAmount == 5) {
        badgeId = 6;
      }

      await db.query(
        `INSERT INTO user_badges (user_id, badge_id, awarded_at)
        SELECT $1, $2, NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2
        )`,
        [req.session.userId, badgeId]
      );
    }
    res.json({
      success: true,
      message: "Application submitted successfully",
      badge_awarded: !!badgeId,
      badge_id: badgeId,
    });
  } catch (err) {
    console.error("Volunteer application error:", err);
    res.status(500).json({
      success: false,
      message: "Error processing volunteer application",
    });
  }
});


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



app.get("/api/volunteers/:eventId", isAuthenticated, async (req, res) => {
  const { eventId } = req.params;
  const userId = req.session.userId;

  try {
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

app.post("/api/volunteer/update-status", isAuthenticated, async (req, res) => {
  const { volunteerId, eventId, status } = req.body;
  const userId = req.session.userId;

  if (!volunteerId || !eventId || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const allowedStatuses = ["pending", "approved", "rejected", "completed"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  try {
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

    await db.query(
      "UPDATE volunteers SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, volunteerId]
    );

    if (status === "approved") {
      const creatorEmail = await db.query(
        "SELECT email FROM users WHERE id = $1",
        [userId]
      );

      if (creatorEmail.rows.length > 0) {
        await db.query(
          "UPDATE volunteers SET coordinator_email = $1 WHERE id = $2",
          [creatorEmail.rows[0].email, volunteerId]
        );
      }
    }

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
      "SELECT * FROM event WHERE user_id = $1 AND status != 'accepted' ORDER BY id DESC",
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

app.get("/balance", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
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

    const balanceResult = await db.query(
      `SELECT balance
       FROM users
       WHERE id = $1`,
      [userId]
    );

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

app.post("/top-up", isAuthenticated, async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to top up",
    });
  }

  const { topUpAmount } = req.body;

  if (!topUpAmount || topUpAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid top-up amount",
    });
  }

  try {
    await db.query("BEGIN");

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

app.post("/withdraw", isAuthenticated, async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in to withdraw",
    });
  }

  const { withdrawalAmount } = req.body;

  if (!withdrawalAmount || withdrawalAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid withdrawal amount",
    });
  }

  try {
    await db.query("BEGIN");

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

app.post('/complete-event/:id', async (req, res) => {
  const eventId = req.params.id;

  try {
    await db.query(
      `UPDATE event 
       SET status = 'completed', 
           end_date = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [eventId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating event:", error);
    res.json({ success: false, error: error.message });
  }
});


app.post(
  "/events/:id/upload-proof",
  isAuthenticated,
  upload.single("proof"),
  async (req, res) => {
    const eventId = req.params.id;

    if (!req.file) {
      return res.status(400).send("No proof image uploaded.");
    }

    let proofPath = req.file.filename;

    try {
      await sharp(req.file.path)
        .resize(600)
        .toFile(path.join(__dirname, "uploads", "temp_" + req.file.filename));

      try {
        fs.copyFileSync(
          path.join(__dirname, "uploads", "temp_" + req.file.filename),
          path.join(__dirname, "uploads", req.file.filename)
        );
        fs.unlinkSync(
          path.join(__dirname, "uploads", "temp_" + req.file.filename)
        );
      } catch (err) {
        console.error("File operation error:", err);
        proofPath = "temp_" + req.file.filename;
      }

      await db.query(
        `UPDATE event SET proof_photo = $1 WHERE id = $2`,
        [proofPath, eventId]
      );

      res.send("Proof photo uploaded successfully.");
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).send("Failed to process and save proof photo.");
    }
  }
);


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

// app.get("/badge", (req, res) => {
//   res.render("badge.ejs", { error: null });
// });

app.get('/badge', async (req, res) => {
  const badgeId = req.query.badge_id;

  if (!badgeId) {
    return res.status(400).send('badge_id is required');
  }

  try {
    const badgesResult = await db.query(
      `SELECT * FROM badges WHERE id = $1`,
      [badgeId]
    );

    if (badgesResult.rows.length === 0) {
      return res.status(404).send('Badge not found');
    }

    const badgeData = badgesResult.rows[0];

    res.render('badge.ejs', {
      badgeData
    });
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).send('Server error');
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
