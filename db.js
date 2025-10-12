const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

// --- Create 'uploads' directory if it doesn't exist ---
const dir = "./uploads";
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`Directory '${dir}' created.`);
}

// --- Connect to the database file ---
const db = new sqlite3.Database("./complaints.db", (err) => {
    if (err) {
        return console.error("Error opening database", err.message);
    }
    console.log("Connected to the SQLite database.");
});

// --- Create the database schema ---
db.serialize(() => {
    // Drop the table if it already exists to ensure the schema is up-to-date
    db.run("DROP TABLE IF EXISTS complaints");

    // Create a new table that can handle both text and voice complaints
    const createTableSql = `
    CREATE TABLE complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint TEXT,
        type TEXT NOT NULL DEFAULT 'text',
        filePath TEXT,
        timestamp TEXT NOT NULL
    )`;

    db.run(createTableSql, (err) => {
        if (err) {
            console.error("Error creating complaints table:", err.message);
        } else {
            console.log('Table "complaints" is ready.');
        }
    });
});

// --- Close the database connection ---
db.close((err) => {
    if (err) {
        console.error(err.message);
    }
    console.log("Closed the database connection.");
});
