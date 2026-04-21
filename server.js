require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const TOKEN_EXPIRY = '8h';

const db = new Database(path.join(__dirname, 'netflix.db'));
db.pragma('journal_mode = WAL');

const moviesSeed = [
  { title: 'Inception', genre: 'Sci-Fi', year: 2010, rating: 8.8 },
  { title: 'The Dark Knight', genre: 'Action', year: 2008, rating: 9.0 },
  { title: 'Stranger Things', genre: 'Drama', year: 2016, rating: 8.7 },
  { title: 'Interstellar', genre: 'Sci-Fi', year: 2014, rating: 8.7 },
  { title: 'Money Heist', genre: 'Crime', year: 2017, rating: 8.2 },
  { title: 'The Crown', genre: 'History', year: 2016, rating: 8.6 },
  { title: 'Breaking Bad', genre: 'Crime', year: 2008, rating: 9.5 },
  { title: 'Wednesday', genre: 'Fantasy', year: 2022, rating: 8.1 }
];

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      rating REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, movie_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
    );
  `);

  const movieCount = db.prepare('SELECT COUNT(*) AS count FROM movies').get().count;
  if (movieCount === 0) {
    const insertMovie = db.prepare(
      'INSERT INTO movies (title, genre, release_year, rating) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((movies) => {
      for (const m of movies) {
        insertMovie.run(m.title, m.genre, m.year, m.rating);
      }
    });
    insertMany(moviesSeed);
  }
}

initDb();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

function createToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY
  });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: process.uptime() });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Name, valid email, and password (min 8 chars) are required' });
  }

  const lowerEmail = String(email).toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(lowerEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(String(name).trim(), lowerEmail, passwordHash);

  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = createToken(user);
  return res.status(201).json({ user, token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db
    .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
    .get(String(email).toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(user);
  return res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user });
});

app.get('/api/movies', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim();
  const genre = String(req.query.genre || '').trim();

  let query = 'SELECT id, title, genre, release_year AS releaseYear, rating FROM movies WHERE 1=1';
  const params = [];

  if (q) {
    query += ' AND title LIKE ?';
    params.push(`%${q}%`);
  }

  if (genre) {
    query += ' AND genre = ?';
    params.push(genre);
  }

  query += ' ORDER BY rating DESC, title ASC';

  const movies = db.prepare(query).all(...params);
  return res.json({ movies });
});

app.get('/api/watchlist', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.genre, m.release_year AS releaseYear, m.rating
       FROM watchlist w
       INNER JOIN movies m ON m.id = w.movie_id
       WHERE w.user_id = ?
       ORDER BY w.added_at DESC`
    )
    .all(req.user.userId);
  return res.json({ watchlist: rows });
});

app.post('/api/watchlist/:movieId', authMiddleware, (req, res) => {
  const movieId = Number(req.params.movieId);
  if (!Number.isInteger(movieId)) {
    return res.status(400).json({ error: 'Invalid movie id' });
  }

  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
  if (!movie) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  db.prepare('INSERT OR IGNORE INTO watchlist (user_id, movie_id) VALUES (?, ?)').run(req.user.userId, movieId);
  return res.status(201).json({ message: 'Movie added to watchlist' });
});

app.delete('/api/watchlist/:movieId', authMiddleware, (req, res) => {
  const movieId = Number(req.params.movieId);
  if (!Number.isInteger(movieId)) {
    return res.status(400).json({ error: 'Invalid movie id' });
  }

  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?').run(req.user.userId, movieId);
  return res.json({ message: 'Movie removed from watchlist' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Netflix app listening on port ${PORT}`);
});
