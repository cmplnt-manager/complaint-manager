// database.js
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const setupDatabase = async () => {
    const client = await pool.connect();
    try {
        console.log("Connected to the database.");

        // --- Drop existing tables to ensure a clean slate ---
        // The CASCADE keyword automatically removes dependent objects.
        console.log("Dropping old tables if they exist...");
        await client.query(`
            DROP TABLE IF EXISTS complaints, users, enterprises CASCADE;
        `);
        console.log("Old tables dropped successfully.");

        // --- Create Enterprises Table ---
        console.log('Creating "enterprises" table...');
        await client.query(`
            CREATE TABLE enterprises (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL
            );
        `);
        console.log('"enterprises" table created.');

        // --- Create Users Table ---
        console.log('Creating "users" table...');
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                enterprise_id INTEGER REFERENCES enterprises(id) ON DELETE CASCADE,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'admin'
            );
        `);
        console.log('"users" table created.');

        // --- Create Complaints Table ---
        console.log('Creating "complaints" table...');
        await client.query(`
            CREATE TABLE complaints (
                id SERIAL PRIMARY KEY,
                enterprise_id INTEGER REFERENCES enterprises(id) ON DELETE CASCADE,
                complaint TEXT,
                type VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                timestamp VARCHAR(255),
                filepath VARCHAR(1024)
            );
        `);
        console.log('"complaints" table created.');

        // --- Auto-create Super Admin Enterprise and User ---
        const superAdminUsername = process.env.SUPERADMIN_USERNAME;
        const superAdminPassword = process.env.SUPERADMIN_PASSWORD;

        if (superAdminUsername && superAdminPassword) {
            console.log("Creating Super Admin enterprise and user...");
            const enterpriseRes = await client.query(
                "INSERT INTO enterprises (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id",
                ["SaaS Platform Admin"]
            );

            // Enterprise ID will be 1 for the first run
            const enterpriseId =
                enterpriseRes.rows.length > 0
                    ? enterpriseRes.rows[0].id
                    : (
                          await client.query(
                              "SELECT id FROM enterprises WHERE name = 'SaaS Platform Admin'"
                          )
                      ).rows[0].id;

            const hashedPassword = await bcrypt.hash(superAdminPassword, 10);

            await client.query(
                `INSERT INTO users (enterprise_id, username, password_hash, role)
                 VALUES ($1, $2, $3, 'superadmin')
                 ON CONFLICT (username) DO NOTHING`,
                [enterpriseId, superAdminUsername, hashedPassword]
            );
            console.log("Super Admin user created or already exists.");
        } else {
            console.warn(
                "SUPERADMIN_USERNAME or SUPERADMIN_PASSWORD not found in .env, skipping super admin creation."
            );
        }

        console.log("Database setup complete.");
    } catch (err) {
        console.error("Error setting up the database:", err);
    } finally {
        client.release();
        console.log("Database client released.");
        await pool.end();
    }
};

setupDatabase();
