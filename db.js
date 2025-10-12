require("dotenv").config();
const { Pool } = require("pg");

// --- Connect to PostgreSQL using the connection string from .env ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required for many cloud providers
    },
});

const createTable = async () => {
    const client = await pool.connect();
    console.log("Connected to the PostgreSQL database.");

    try {
        // Drop the table if it exists to ensure a fresh setup
        await client.query("DROP TABLE IF EXISTS complaints");
        console.log('Dropped existing "complaints" table (if any).');

        // Create a new table with a schema compatible with PostgreSQL
        const createTableQuery = `
        CREATE TABLE complaints (
            id SERIAL PRIMARY KEY,
            complaint TEXT,
            type VARCHAR(10) NOT NULL DEFAULT 'text',
            filePath TEXT,
            timestamp VARCHAR(255) NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'open'
        )`;

        await client.query(createTableQuery);
        console.log('Table "complaints" is ready.');
    } catch (err) {
        console.error("Error during database setup:", err.stack);
    } finally {
        await client.release();
        console.log("Closed the database connection.");
        await pool.end();
    }
};

createTable();
