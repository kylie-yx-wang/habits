const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
//const db = new sqlite3.Database('./database.db'); // makes the database
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Only enable SSL if we are in production
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false 
});

// parses http requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // gets stuff from public folder


// login sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// Create tables
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
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
}
initDb();
// db.serialize(() => {
//   db.run(`
//     CREATE TABLE IF NOT EXISTS users (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       username TEXT UNIQUE,
//       password TEXT
//     )
//   `);
//   db.run(`
//     CREATE TABLE IF NOT EXISTS goals (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       user_id INTEGER,
//       name TEXT,
//       done INTEGER DEFAULT 0,
//       aim INTEGER,
//       start_date DATE,
//       end_date DATE,
//       lock BOOLEAN,
//       FOREIGN KEY(user_id) REFERENCES users(id)
//     )
//   `);
// });
app.get('/', (req, res) => {
  res.redirect('/login.html');
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
  
    pool.query(
      `INSERT INTO users (username, password) VALUES ($1, $2)`,
      [req.body.username, hashed],
      (err) => {
        if (err) return res.redirect('/login.html?error=exists');
        res.redirect('/login.html?registered=1');
      }
    );
  });
  

// Login
app.post('/login', (req, res) => {
  pool.query(
    `SELECT * FROM users WHERE username = $1`,
    [req.body.username],
    async (err, result) => {
      if (err || result.rows.length === 0) return res.redirect("/login.html?error=nonexistent");
      const user = result.rows[0];
      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) return res.redirect('/login.html?error=incorrect');

      // redirect
      req.session.user = user.id;
      res.redirect('/dashboard');
    }
  );
});

// app.get('/goals', (req, res) => {

//     if (!req.session.user) {
//       return res.status(401).json({ error: "Not logged in" });
//     }
  
//     pool.query(
//       `SELECT * FROM goals WHERE user_id = $1`,
//       [req.session.user],
//       (err, rows) => {
//         if (err) return res.status(500).json({ error: "Database error" });
//         res.json(rows);
//       }
//     );
  
//   });
  app.get('/goals', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const { rows } = await pool.query(
            `SELECT * FROM goals WHERE user_id = $1`, 
            [req.session.user]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(__dirname + '/private/settings.html');
});

// add goal
// app.post('/make_goal', async (req, res) => {
//     let per = 1;
//     if (req.body.period == "week") {
//         per = 7;
//     } else if (req.body.period == "month") {
//         per = 30.5;
//     } else if (req.body.period == "year") {
//         per = 365;
//     }
//     const date1 = new Date(req.body.from);
//     const date2 = new Date(req.body.to);
//     const timeDiff = date2 - date1; // diff in milliseconds
//     const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // convert to days

//     const total = req.body.freq * daysDiff * req.body.leniency / 100 / per ;

//     const isLocked = req.body.lock === 'on' ? 1 : 0;
//     pool.query(
//         `INSERT INTO goals (
//         user_id, name, aim, start_date, end_date, lock)
//         VALUES ($1, $2, $3, $4, $5, $6)`,
//         [req.session.user, req.body.name, Math.round(total) || 0, 
//             req.body.from, req.body.to, isLocked],
//         (err) => {
//             if (err) {
//                 console.error(err);
//                 return res.redirect('/settings?error=db');
//             }
//             res.redirect('/dashboard?saved=1');}
//       );
// });

app.post('/make_goal', async (req, res) => {
  try {
      let per = 1;
      if (req.body.period == "week") per = 7;
      else if (req.body.period == "month") per = 30.5;
      else if (req.body.period == "year") per = 365;

      const date1 = new Date(req.body.from);
      const date2 = new Date(req.body.to);
      const daysDiff = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
      const total = req.body.freq * daysDiff * req.body.leniency / 100 / per;
      const isLocked = req.body.lock === 'on';

      await pool.query(
          `INSERT INTO goals (user_id, name, aim, start_date, end_date, lock) VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.session.user, req.body.name, Math.round(total) || 0, req.body.from, req.body.to, isLocked]
      );
      res.redirect('/dashboard?saved=1');
  } catch (err) {
      console.error(err);
      res.redirect('/settings?error=db');
  }
});

// app.post('/edit_goal', async(req, res) => {
//     pool.query(`UPDATE goals SET aim=$1, end_date=$2 WHERE id=$3 AND user_id=$4`,
//          [req.body.numTimes, req.body.newEnd, req.body.id, req.session.user],
//          (err) => {
//             if (err) return res.redirect('/settings?error=update');
//             res.redirect('/settings?updated=1');
//         });
// });

app.post('/edit_goal', async (req, res) => {
  try {
      await pool.query(`UPDATE goals SET aim=$1, end_date=$2 WHERE id=$3 AND user_id=$4`,
          [req.body.numTimes, req.body.newEnd, req.body.id, req.session.user]);
      res.redirect('/settings?updated=1');
  } catch (err) {
      res.redirect('/settings?error=update');
  }
});

// app.post('/delete_goal', async(req, res) => {
//     pool.query(`DELETE FROM goals WHERE id=$1 AND user_id=$2`,
//       [req.body.id, req.session.user],
//          (err) => {
//             if (err) return res.redirect('/settings?error=update');
//             res.redirect('/settings?updated=1');
//         });
// });
app.post('/delete_goal', async (req, res) => {
  try {
      await pool.query(`DELETE FROM goals WHERE id=$1 AND user_id=$2`,
          [req.body.id, req.session.user]);
      res.redirect('/settings?updated=1');
  } catch (err) {
      res.redirect('/settings?error=update');
  }
});

// app.post('/incr_goals', async(req, res) => {
//   if (!req.session.user) return res.status(401).send("Unauthorized");

//   let ids = req.body.goal_checkbox;

//   // nothing is checked, just redirect back
//   if (!ids) {
//       return res.redirect('/dashboard');
//   }

//   // if only 1 is checked it becomes a string
//   if (!Array.isArray(ids)) {
//       ids = [ids];
//   }

//   // Update the database for each ID
//   // use a counter to know when all updates are finished
//   let completed = 0;
//   let newlyFinished = false;

//   ids.forEach(goalId => {
//       pool.query(
//           `UPDATE goals SET done = done + 1 WHERE id = $1 AND user_id = $2
//           RETURNING done, aim`,
//           [goalId, req.session.user],
//           (err, row) => {
//             if (err) return res.redirect('/dashboard?error=update');
//               completed++;
//               if (row.done === row.aim) {
//                 newlyFinished = true;
//               }
//               if (completed === ids.length) {
//                   // Only redirect once the last update is done
//                   if (newlyFinished) {
//                     res.redirect('/dashboard?finished=1');
//                   } else {
//                     res.redirect('/dashboard?updated=1');
//                   }
//               }
//           }
//       );
//   });
  
// });

app.post('/incr_goals', async (req, res) => {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  
  let ids = Array.isArray(req.body.goal_checkbox) ? req.body.goal_checkbox : [req.body.goal_checkbox];
  if (!req.body.goal_checkbox) return res.redirect('/dashboard');

  try {
      let newlyFinished = false;
      // Use Promise.all to run updates in parallel and wait for them all to finish
      const results = await Promise.all(ids.map(id => 
          pool.query(`UPDATE goals SET done = done + 1 WHERE id = $1 AND user_id = $2 RETURNING done, aim`, [id, req.session.user])
      ));

      results.forEach(result => {
          const row = result.rows[0];
          if (row && row.done >= row.aim) newlyFinished = true;
      });

      res.redirect(newlyFinished ? '/dashboard?finished=1' : '/dashboard?updated=1');
  } catch (err) {
      console.error(err);
      res.redirect('/dashboard?error=update');
  }
});
  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

