require("dotenv").config(); // Load environment variables from .env file

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const basicAuth = require("express-basic-auth");
const nodemailer = require("nodemailer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Supabase PostgreSQL Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// --- Cloudinary Configuration ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// --- Multer Configuration (to handle file in memory) ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Admin Authentication ---
const adminAuthenticator = basicAuth({
    users: { admin: "password" },
    challenge: true,
    realm: "Admin Area",
});

// --- Helper for IST Timestamps ---
function getIndianTimestamp() {
    return new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

// --- API Routes ---

// GET all complaints
app.get("/api/complaints", adminAuthenticator, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM complaints ORDER BY id DESC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST a new text complaint
app.post("/api/complaints", async (req, res) => {
    const { complaint } = req.body;
    if (!complaint) {
        return res.status(400).json({ error: "Complaint text is required." });
    }
    const timestamp = getIndianTimestamp();
    const sql = `INSERT INTO complaints (complaint, type, timestamp, status) VALUES ($1, 'text', $2, 'open') RETURNING id`;

    try {
        const result = await pool.query(sql, [complaint, timestamp]);
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST a new voice complaint
app.post("/api/complaints/voice", upload.single("complaint"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Audio file is required." });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "video" },
        async (error, result) => {
            if (error) {
                console.error("Cloudinary upload error:", error);
                return res
                    .status(500)
                    .json({ error: "Failed to upload voice message." });
            }

            const filePath = result.secure_url;
            const timestamp = getIndianTimestamp();
            const sql = `INSERT INTO complaints (type, filePath, timestamp, status) VALUES ('voice', $1, $2, 'open') RETURNING id`;

            try {
                const dbResult = await pool.query(sql, [filePath, timestamp]);
                res.status(201).json({
                    id: dbResult.rows[0].id,
                    path: filePath,
                });
            } catch (dbError) {
                console.error("Database error after upload:", dbError);
                res.status(500).json({ error: dbError.message });
            }
        }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
});

// DELETE a complaint by ID
app.delete("/api/complaints/:id", adminAuthenticator, async (req, res) => {
    const { id } = req.params;
    try {
        const fileResult = await pool.query(
            "SELECT filePath FROM complaints WHERE id = $1 AND type = 'voice'",
            [id]
        );

        if (fileResult.rows.length > 0 && fileResult.rows[0].filepath) {
            const url = fileResult.rows[0].filepath;
            const publicId = path.parse(url).name;
            await cloudinary.uploader.destroy(publicId, {
                resource_type: "video",
            });
        }

        const deleteResult = await pool.query(
            "DELETE FROM complaints WHERE id = $1",
            [id]
        );
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ message: "Complaint not found." });
        }
        res.json({ message: "Complaint deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PUT - Update a complaint's status
app.put("/api/complaints/:id/status", adminAuthenticator, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["open", "resolved"].includes(status)) {
        return res.status(400).json({ error: "Invalid status provided." });
    }
    try {
        const result = await pool.query(
            "UPDATE complaints SET status = $1 WHERE id = $2",
            [status, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Complaint not found." });
        }
        res.json({ message: `Status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- Serve Admin Page ---
app.get("/admin", adminAuthenticator, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin`);
});
