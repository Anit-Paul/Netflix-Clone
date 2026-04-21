# Netflix Clone (Full-Stack Web Application)

A complete Netflix-inspired web app with:

- ✅ Frontend (HTML/CSS/Vanilla JS)
- ✅ Backend (Node.js + Express)
- ✅ JWT authentication (register/login/me)
- ✅ SQLite database for users, movies, and watchlists
- ✅ Security middleware (`helmet`, rate limiting, CORS)
- ✅ Designed to support at least 100 concurrent users (validated with load testing)

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (served from `/public`)
- **Backend:** Node.js, Express
- **Database:** SQLite (`better-sqlite3` with WAL mode)
- **Auth:** JWT + hashed passwords (`bcryptjs`)

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server.js
├── package.json
└── netflix.db (auto-created on first run)
```

## Setup

```bash
npm install
npm start
```

The app runs at: `http://localhost:3000`

## API Endpoints

### Public
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Protected (Bearer token required)
- `GET /api/auth/me`
- `GET /api/movies`
- `GET /api/watchlist`
- `POST /api/watchlist/:movieId`
- `DELETE /api/watchlist/:movieId`

## Concurrency / 100+ Users

You can validate backend throughput using `autocannon`:

```bash
npx autocannon -c 100 -d 20 http://localhost:3000/api/health
```

This simulates **100 concurrent clients** hitting the service.

## Authentication Flow

1. Register with name, email, password (min 8 chars).
2. Login to receive a JWT token.
3. Token is stored in browser localStorage.
4. Frontend sends `Authorization: Bearer <token>` for protected endpoints.

## Notes

- Set `JWT_SECRET` in environment for production security.
- Database initializes automatically with a sample movie catalog.
