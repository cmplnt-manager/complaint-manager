// server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 3000;

// --- Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// --- Cloudinary Configuration ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Middleware ---
app.use(express.json());
app.use(express.static("public"));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === "superadmin") {
        next();
    } else {
        res.status(403).json({
            message: "Forbidden: Requires super admin privileges.",
        });
    }
};

const getIndianTimestamp = () =>
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

// --- Frontend Page Routes ---
app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/submit", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/login", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "login.html"))
);
app.get("/dashboard", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "dashboard.html"))
);
app.get("/admin", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "enterprise-admin.html"))
);

// --- Public API Routes ---
app.post("/api/complaint-text/:enterpriseId", async (req, res) => {
    const { complaint } = req.body;
    const { enterpriseId } = req.params;
    try {
        await pool.query(
            "INSERT INTO complaints (enterprise_id, complaint, type, timestamp) VALUES ($1, $2, $3, $4)",
            [enterpriseId, complaint, "text", getIndianTimestamp()]
        );
        res.status(201).json({ message: "Complaint submitted successfully." });
    } catch (error) {
        console.error("Error submitting text complaint:", error);
        res.status(500).json({ message: "Failed to submit complaint." });
    }
});

app.post(
    "/api/complaint-voice/:enterpriseId",
    upload.single("complaint"),
    (req, res) => {
        const { enterpriseId } = req.params;
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: "video" },
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
                    return res
                        .status(500)
                        .send("Failed to upload voice message.");
                }
                try {
                    await pool.query(
                        "INSERT INTO complaints (enterprise_id, type, timestamp, filepath) VALUES ($1, $2, $3, $4)",
                        [
                            enterpriseId,
                            "voice",
                            getIndianTimestamp(),
                            result.secure_url,
                        ]
                    );
                    res.status(201).json({
                        message: "Voice complaint submitted.",
                    });
                } catch (dbError) {
                    console.error(
                        "Error saving voice complaint to DB:",
                        dbError
                    );
                    res.status(500).send(
                        "Failed to save voice complaint record."
                    );
                }
            }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    }
);

// --- Auth API Route ---
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );
        if (result.rows.length === 0)
            return res.status(400).json({ message: "Invalid credentials." });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );
        if (!validPassword)
            return res.status(400).json({ message: "Invalid credentials." });

        const tokenPayload = {
            id: user.id,
            username: user.username,
            enterpriseId: user.enterprise_id,
            role: user.role,
        };
        const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: "1d",
        });
        res.json({ accessToken });
    } catch (error) {
        console.error("--- LOGIN ERROR ---", error);
        res.status(500).json({
            message: "Login failed due to a server error.",
        });
    }
});

// --- Secure Enterprise User API Routes ---
app.get("/api/complaints", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM complaints WHERE enterprise_id = $1 ORDER BY id DESC",
            [req.user.enterpriseId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching complaints:", error);
        res.status(500).json({ message: "Failed to fetch complaints." });
    }
});

app.delete("/api/complaints/:id", authenticateToken, async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM complaints WHERE id = $1 AND enterprise_id = $2",
            [req.params.id, req.user.enterpriseId]
        );
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting complaint:", error);
        res.status(500).json({ message: "Failed to delete complaint." });
    }
});

app.put("/api/complaints/:id/status", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "UPDATE complaints SET status = $1 WHERE id = $2 AND enterprise_id = $3",
            [req.body.status, req.params.id, req.user.enterpriseId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ message: "Failed to update status." });
    }
});

// --- Super Admin Management API Routes ---
app.get(
    "/api/manage/enterprises",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        try {
            const result = await pool.query(
                "SELECT * FROM enterprises ORDER BY name ASC"
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching enterprises:", error);
            res.status(500).json({ message: "Failed to fetch enterprises." });
        }
    }
);

app.get(
    "/api/manage/users/:enterpriseId",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        try {
            const result = await pool.query(
                "SELECT id, username, role FROM users WHERE enterprise_id = $1 ORDER BY username ASC",
                [req.params.enterpriseId]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).json({ message: "Failed to fetch users." });
        }
    }
);

app.post(
    "/api/manage/enterprises",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        try {
            const result = await pool.query(
                "INSERT INTO enterprises (name) VALUES ($1) RETURNING *",
                [req.body.name]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error("Error creating enterprise:", error);
            res.status(500).json({ message: "Failed to create enterprise." });
        }
    }
);

app.post(
    "/api/manage/users",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        const { username, password, enterpriseId, role = "admin" } = req.body;
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await pool.query(
                "INSERT INTO users (username, password_hash, enterprise_id, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role",
                [username, hashedPassword, enterpriseId, role]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error("Error creating user:", error);
            res.status(500).json({ message: "User creation failed." });
        }
    }
);

app.delete(
    "/api/manage/users/:userId",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        const { userId } = req.params;
        if (parseInt(userId, 10) === req.user.id)
            return res
                .status(400)
                .json({ message: "Cannot delete your own account." });
        try {
            await pool.query("DELETE FROM users WHERE id = $1", [userId]);
            res.status(204).send();
        } catch (error) {
            console.error("Error deleting user:", error);
            res.status(500).json({ message: "Failed to delete user." });
        }
    }
);

app.delete(
    "/api/manage/enterprises/:enterpriseId",
    authenticateToken,
    isSuperAdmin,
    async (req, res) => {
        try {
            await pool.query("DELETE FROM enterprises WHERE id = $1", [
                req.params.enterpriseId,
            ]);
            res.status(204).send();
        } catch (error) {
            console.error("Error deleting enterprise:", error);
            res.status(500).json({ message: "Failed to delete enterprise." });
        }
    }
);

app.listen(port, () =>
    console.log(`Server running at http://localhost:${port}`)
);
