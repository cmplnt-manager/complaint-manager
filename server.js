const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const basicAuth = require("express-basic-auth");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;

// --- Database Connection ---
const db = new sqlite3.Database("./complaints.db", (err) => {
    if (err) {
        console.error("Error connecting to the database:", err.message);
    } else {
        console.log(
            "Successfully connected to the SQLite database for server operations."
        );
    }
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Nodemailer Setup ---
// IMPORTANT: Replace with your actual email service credentials
// For security, use environment variables in a real application
const transporter = nodemailer.createTransport({
    service: "gmail", // e.g., 'gmail', 'outlook'
    auth: {
        user: "your_email@example.com",
        pass: "your_email_password",
    },
});

// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "complaint-" + uniqueSuffix + ".webm");
    },
});
const upload = multer({ storage: storage });

// --- Admin Authentication ---
const adminAuthenticator = basicAuth({
    users: { admin: "password" },
    challenge: true,
    realm: "Admin Area",
});

// --- API Routes ---

// GET all complaints (for admin)
app.get("/api/complaints", adminAuthenticator, (req, res) => {
    db.all("SELECT * FROM complaints ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// POST a new text complaint
app.post("/api/complaints", (req, res) => {
    const { complaint } = req.body;
    if (!complaint) {
        return res.status(400).json({ error: "Complaint text is required." });
    }
    const timestamp = new Date().toLocaleString();
    const sql = `INSERT INTO complaints (complaint, type, timestamp) VALUES (?, 'text', ?)`;

    db.run(sql, [complaint, timestamp], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // sendEmailNotification(
        //     `New text complaint submitted.`,
        //     `Details: ${complaint}`
        // );
        res.status(201).json({ id: this.lastID });
    });
});

// POST a new voice complaint
app.post("/api/complaints/voice", upload.single("complaint"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Audio file is required." });
    }
    const filePath = `/uploads/${req.file.filename}`;
    const timestamp = new Date().toLocaleString();
    const sql = `INSERT INTO complaints (type, filePath, timestamp) VALUES ('voice', ?, ?)`;

    db.run(sql, [filePath, timestamp], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // sendEmailNotification(
        //     `New voice complaint submitted.`,
        //     `Audio file available at: ${filePath}`
        // );
        res.status(201).json({ id: this.lastID, path: filePath });
    });
});

// --- Email Helper Function ---
function sendEmailNotification(subject, text) {
    const mailOptions = {
        from: "your_email@example.com",
        to: "recipient_email@example.com", // The admin's email
        subject: subject,
        text: text,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log("Error sending email:", error);
        }
        console.log("Email sent: " + info.response);
    });
}

// --- Serve Admin Page ---
app.get("/admin", adminAuthenticator, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin`);
});
