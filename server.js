const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const db = new sqlite3.Database('./database.db'); // makes the database

// parses http requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // gets stuff from public folder

// login sessions
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
});

// Register
app.post('/register', async (req, res) => {
  const hashed = await bcrypt.hash(req.body.password, 10);
    // ? prevents injections
  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [req.body.username, hashed],
    (err) => {
      if (err) return res.send("User exists");
      res.send("Registered!");
    }
  );
});

// Login
app.post('/login', (req, res) => {
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [req.body.username],
    async (err, user) => {
      if (!user) return res.send("User not found");

      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) return res.send("Wrong password");

      // redirect
      req.session.user = user.id;
      res.redirect('/dashboard.html');
    }
  );
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
