// server.js
// This is the main backend server file.

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const basicAuth = require("express-basic-auth");

const app = express();
const port = 3000;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname, "public"))); // Serve static files from 'public' directory

// --- Admin Authentication ---
// IMPORTANT: In a real application, use environment variables for credentials.
const adminAuth = basicAuth({
    users: { admin: "password" }, // You can change these credentials
    challenge: true, // This will cause the browser to show a login dialog.
});

// Connect to the SQLite database
const db = new sqlite3.Database(
    "./complaints.db",
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) {
            console.error("Error connecting to the database:", err.message);
            console.error("Did you run `npm run init-db` first?");
        } else {
            console.log("Successfully connected to the SQLite database.");
        }
    }
);

// --- API Routes ---

// POST a new complaint
app.post("/api/complaints", (req, res) => {
    const { complaint } = req.body;

    if (!complaint || complaint.trim() === "") {
        return res
            .status(400)
            .json({ error: "Complaint text cannot be empty." });
    }

    // Generate a timestamp string from the server's local time
    const timestamp = new Date().toLocaleString();

    const sql = `INSERT INTO complaints (complaint, timestamp) VALUES (?, ?)`;
    db.run(sql, [complaint, timestamp], function (err) {
        if (err) {
            console.error("Error inserting data:", err.message);
            return res.status(500).json({ error: "Failed to save complaint." });
        }
        res.status(201).json({
            id: this.lastID,
            message: "Complaint submitted successfully!",
        });
    });
});

// GET all complaints (for the admin) - Now protected
app.get("/api/complaints", adminAuth, (req, res) => {
    const sql = `SELECT id, complaint, timestamp FROM complaints ORDER BY timestamp DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res
                .status(500)
                .json({ error: "Failed to retrieve complaints." });
        }
        res.json({ complaints: rows });
    });
});

// --- Serve Frontend Pages ---

// Serve the user-facing complaint submission page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve the admin page to view complaints - Now protected
app.get("/admin", adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Admin panel available at http://localhost:${port}/admin`);
});
