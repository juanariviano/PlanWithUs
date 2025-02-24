import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { fileURLToPath } from "url";

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public"));

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

// Route Utama - Menampilkan Event Aktif
app.get("/", async (req, res) => {
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

// Route untuk Membuat Event Baru
app.get("/create", (req, res) => {
  res.render("create.ejs");
});

// **POST Request untuk Membuat Event Baru dengan Upload**
app.post(
  "/create",
  upload.fields([{ name: "thumbnailphoto" }, { name: "file" }]),
  async (req, res) => {
    const { eventname, coordinatorname, email, targetmoney, additionalnotes } =
      req.body;

    let thumbnailPath = null;
    let proposalPath = null;
    let proposalFileBuffer = null;

    try {
      // Handle thumbnail photo if uploaded
      if (req.files["thumbnailphoto"]) {
        const thumbnail = req.files["thumbnailphoto"][0];
        // Simpan hanya nama file, bukan full path
        thumbnailPath = thumbnail.filename; // Ubah ini dari thumbnail.path

        // Resize image setelah upload
        await sharp(thumbnail.path)
          .resize(491, 493)
          .toFile(
            path.join(__dirname, "uploads", thumbnail.filename + "_resized")
          );

        // Replace original dengan resized image
        fs.unlinkSync(thumbnail.path);
        fs.renameSync(
          path.join(__dirname, "uploads", thumbnail.filename + "_resized"),
          path.join(__dirname, "uploads", thumbnail.filename)
        );
      }

      // Handle proposal file if uploaded
      if (req.files["file"]) {
        proposalPath = req.files["file"][0].path;
        proposalFileBuffer = fs.readFileSync(proposalPath);
      }

      // Insert into database
      await db.query(
        `INSERT INTO event (event_name, coordinator_name, email, target_money, proposal_file, thumbnail_photo, additional_notes, raised_money, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active')`,
        [
          eventname,
          coordinatorname,
          email,
          targetmoney,
          proposalFileBuffer,
          thumbnailPath,
          additionalnotes,
        ]
      );

      res.redirect("/");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error processing upload and saving to database");
    }
  }
);

// Route untuk Mengunduh Proposal PDF
app.get("/download/:id", async (req, res) => {
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

// Route untuk Donasi
// Update raised_money dan cek apakah target tercapai
app.post("/donate", async (req, res) => {
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

    // Add to donation history
    await db.query(
      "INSERT INTO donation_history (event_id, donation_amount) VALUES ($1, $2)",
      [eventId, donationAmount]
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

// Route untuk Mengubah Status Event ke Completed
app.post("/update-status", async (req, res) => {
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

// Route untuk Melihat Riwayat Event yang Selesai
app.get("/history", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
      e.id,
      e.event_name,
      e.additional_notes,
      e.end_date,
      e.raised_money,
      e.target_money,
      e.thumbnail_photo,
      MIN(dh.donation_date) as first_donation_date
    FROM event e
    LEFT JOIN donation_history dh ON e.id = dh.event_id
    WHERE e.raised_money > 0
    GROUP BY e.id
    ORDER BY COALESCE(e.end_date, MIN(dh.donation_date)) DESC
    `);

    // Format dates untuk tampilan
    const historyEvents = result.rows.map((event) => ({
      ...event,
      end_date: event.end_date
        ? new Date(event.end_date).toLocaleDateString("en-GB")
        : null,
      first_donation_date: event.first_donation_date
        ? new Date(event.first_donation_date).toLocaleDateString("en-GB")
        : null,
    }));

    res.render("history.ejs", { historyEvents: historyEvents || [] });
  } catch (err) {
    console.error(err);
    // Jika terjadi error, tetap render halaman dengan array kosong
    res.render("history.ejs", { historyEvents: [] });
  }
});

// Route untuk Arsip Event yang Selesai
app.get("/archive", async (req, res) => {
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

// Menjalankan Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
