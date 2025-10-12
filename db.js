// database.js
// This script initializes the SQLite database.

const sqlite3 = require("sqlite3").verbose();

// Create a new database file named 'complaints.db'
const db = new sqlite3.Database("./complaints.db", (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log("Connected to the SQLite database.");
        // Create the complaints table if it doesn't exist
        // We now use TEXT for the timestamp and won't set a default,
        // as the application will provide the local time.
        db.run(
            `CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`,
            (err) => {
                if (err) {
                    console.error("Error creating table", err.message);
                } else {
                    console.log('Table "complaints" is ready.');
                }
                // Close the database connection
                db.close((err) => {
                    if (err) {
                        console.error(err.message);
                    }
                    console.log("Closed the database connection.");
                });
            }
        );
    }
});
