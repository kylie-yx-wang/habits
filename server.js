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
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      done INTEGER DEFAULT 0,
      aim INTEGER,
      start_date DATE,
      end_date DATE,
      lock BOOLEAN,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
  
    res.sendFile(__dirname + '/private/dashboard.html');
  });
  

// Register
app.post('/register', async (req, res) => {
    const hashed = await bcrypt.hash(req.body.password, 10);
  
    db.run(
      `INSERT INTO users (username, password) VALUES (?, ?)`,
      [req.body.username, hashed],
      (err) => {
        if (err) return res.redirect('/login.html?error=exists');
        res.redirect('/login.html?registered=1');
      }
    );
  });
  

// Login
app.post('/login', (req, res) => {
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [req.body.username],
    async (err, user) => {
      if (!user) return res.redirect("/login.html?error=nonexistent");

      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) return res.redirect('/login.html?error=incorrect');

      // redirect
      req.session.user = user.id;
      res.redirect('/dashboard');
    }
  );
});

app.get('/goals', (req, res) => {

    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
  
    db.all(
      `SELECT * FROM goals WHERE user_id = ?`,
      [req.session.user],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
      }
    );
  
  });

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(__dirname + '/private/settings.html');
});

// add goal
app.post('/make_goal', async (req, res) => {
    let per = 1;
    if (req.body.period == "week") {
        per = 7;
    } else if (req.body.period == "month") {
        per = 30.5;
    } else if (req.body.period == "year") {
        per = 365;
    }
    const date1 = new Date(req.body.from);
    const date2 = new Date(req.body.to);
    const timeDiff = date2 - date1; // diff in milliseconds
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // convert to days

    const total = req.body.freq * daysDiff * req.body.leniency / 100 / per ;

    const isLocked = req.body.lock === 'on' ? 1 : 0;
    db.run(
        `INSERT INTO goals (
        user_id, name, aim, start_date, end_date, lock)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [req.session.user, req.body.name, Math.round(total) || 0, 
            req.body.from, req.body.to, isLocked],
        (err) => {
            if (err) {
                console.error(err);
                return res.redirect('/settings?error=db');
            }
            res.redirect('/dashboard?saved=1');}
      );
});

app.post('/edit_goal', async(req, res) => {
    db.run(`UPDATE goals SET aim=?, end_date=? WHERE id=?`,
         [req.body.numTimes, req.body.newEnd, req.body.id],
         (err) => {
            if (err) return res.redirect('/settings?error=update');
            res.redirect('/dashboard?updated=1');
        });
});
  

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

