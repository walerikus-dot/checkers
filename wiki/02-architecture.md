# Checkers — Architecture

## System Diagram

```
                         Internet
                            │
                     ┌──────▼──────┐
                     │   Browser   │
                     │  (client)   │
                     └──────┬──────┘
                            │ HTTPS / WSS  (port 443)
                            │ HTTP port 80 → 301 redirect to HTTPS
                            │
                     ┌──────▼──────────────────────────────────────┐
                     │   Nginx  (Docker, ports 80 + 443)            │
                     │   chashki.duckdns.org → 130.12.242.84        │
                     │   TLS: Let's Encrypt (auto-renews)           │
                     │                                              │
                     │  GET /checkers-final.html                    │
                     │    → serve file from /opt/checkers/nginx/html│
                     │                                              │
                     │  /socket.io/*                                │
                     │    → proxy to relay:3000                     │
                     │                                              │
                     │  /api/*                                      │
                     │    → proxy to backend:3001                   │
                     └──────┬──────────────────────┬───────────────┘
                            │ WebSocket             │ HTTP REST
               ┌────────────▼────────┐  ┌──────────▼──────────┐
               │   Next.js Frontend  │  │   Full Backend       │
               │   (Docker)          │  │   (Docker)           │
               │   port 3001         │  │   port 3001          │
               │   / → Next.js pages │  │   NestJS main.ts     │
               └────────────────────┘  │   REST + /guest WS   │
                                        │   + /game WS         │
                                        └──────────┬──────────┘
                                   ┌───────────────┴──────────────┐
                            ┌──────▼──────┐              ┌────────▼──────┐
                            │  PostgreSQL  │              │    Redis       │
                            │  (Docker)   │              │   (Docker)     │
                            └────────────┘              └───────────────┘
```

---

## Two Entry Points

The NestJS backend has two separate entry points. Which one you start determines the runtime mode.

### `guest-main.ts` — Relay Only

- Boots only the `GuestModule`
- No database connection, no Redis, no auth middleware
- Runs the Socket.io `/guest` namespace for in-memory room relay
- Used in production (Docker container on port 3000)
- Used in local development with `npm run start:guest`

**When to use:** Any time you only need online multiplayer without accounts. No Postgres or Redis required.

### `main.ts` — Full Backend

- Boots all modules: auth, users, games, ratings, tournaments, friends, messaging
- Requires a running PostgreSQL instance and Redis
- Runs both the REST API and the Socket.io `/game` namespace
- Deployed in production as the `backend` Docker service (port 3001) alongside the relay

**When to use:** When developing account features, game history, ratings, or the Next.js frontend integration.

**Fork A note:** `app.module.ts` reads a `DB_SYNC` environment variable. Set `DB_SYNC=true` on first deploy to let TypeORM auto-create the schema, then set it back to `false` for all subsequent restarts to prevent accidental schema drops.

---

## The Three Layers

### Layer 1: HTML Client (`checkers-final.html`)

A single self-contained HTML file. All of the following are bundled inline:

- Complete game engine for all three rule sets (Russian, English, International)
- Minimax AI with alpha-beta pruning
- Move validation and mandatory-capture enforcement
- Rendering (canvas or DOM, cyberpunk dark theme)
- Socket.io client for connecting to the Guest Relay

**Why a single HTML file?**

The standalone approach was chosen for zero-friction deployment and development:

- No build step — edit and reload
- No Node.js required to serve (any static file host works)
- Single-file deployment: `scp checkers-final.html server:/var/www/`
- Instantly accessible at a public URL with no CI pipeline
- Zero cold-start — nginx serves it directly from disk

This makes iteration extremely fast and eliminates the entire class of "works on my machine" build problems.

### Layer 2: Guest Relay

A lightweight NestJS module (`GuestModule`) that acts as a pure message forwarder over Socket.io.

**Key design principle: the relay does not run the game engine.**

- The client that creates a room is the authoritative source of game state
- When a player makes a move, the client sends it to the relay
- The relay broadcasts it to the other player in the room
- No move validation occurs on the server
- This keeps the relay stateless and trivially scalable

Room management:

- Rooms are stored in an in-memory `Map`
- Each room has an ID, an optional lock code, and at most two player sockets
- The room list is available to clients (used for the auto-refreshing lobby, polled every 4 seconds)
- Rooms disappear when the server restarts (there is no persistence)

### Layer 3: Full Backend

The full NestJS application (`main.ts`) provides:

- REST API for user management, game history, ratings, friends, messages, tournaments
- JWT-secured WebSocket namespace (`/game`) for authenticated real-time play
- TypeORM entities mapped to PostgreSQL
- Redis for session caching and pub-sub
- `POST /api/games/guest-result` — records the outcome of a guest relay game for a logged-in user so that Glicko2 ratings are updated even when playing through the anonymous relay

---

## WebSocket Namespace Design

| Namespace | Entry Point | Auth | Purpose |
|---|---|---|---|
| `/guest` | `guest-main.ts` | None | Guest relay — anonymous online play |
| `/game` | `main.ts` | JWT required | Full authenticated multiplayer |

The two namespaces are mutually exclusive at runtime. The deployed Docker container runs only `/guest`. The `/game` namespace will be activated once the full backend is deployed.

---

## Nginx Configuration

Nginx runs as a Docker container (part of the five-service stack) and has four responsibilities:

**1. Redirect HTTP → HTTPS**

```nginx
server {
    listen 80;
    server_name chashki.duckdns.org;
    return 301 https://$host$request_uri;
}
```

**2. Serve the HTML client** (on port 443)

```nginx
location / {
    root /usr/share/nginx/html;
}
```

HTML is mounted from `/opt/checkers/nginx/html/` on the host. The SSL certificate (`/etc/letsencrypt/live/chashki.duckdns.org/`) is bind-mounted read-only from the host.

**3. Proxy WebSocket traffic to the relay**

```nginx
location /socket.io/ {
    proxy_pass http://relay:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

**4. Proxy REST API traffic to the backend**

```nginx
location /api/ {
    resolver 127.0.0.11 valid=10s;
    set $backend_host backend:3001;
    proxy_pass http://$backend_host;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

The `resolver 127.0.0.11` directive (Docker's internal DNS) combined with the `set $backend_host` variable enables lazy upstream resolution — nginx starts successfully even if the backend container is still booting.

This means the browser connects to port 80 on the server for everything — no CORS issues, no mixed-content problems, no port exposure. Neither the relay nor the backend is reachable from outside the server directly.

---

## Docker

The entire production stack is containerized as five Docker Compose services:

```
docker-compose.yml
  ├── postgres     — PostgreSQL 16, data volume: pgdata
  ├── redis        — Redis 7 alpine
  ├── relay        — NestJS guest-main.ts, port 3000 (internal only)
  ├── backend      — NestJS main.ts, port 3001 (internal only)
  │                  built from backend/Dockerfile (node:20-alpine)
  │                  native modules (bcrypt) compiled with python3/make/g++
  └── nginx        — port 80 exposed to internet
                     mounts /opt/checkers/nginx/html/ for static files
                     proxies /socket.io/ → relay:3000
                     proxies /api/ → backend:3001
```

All inter-service communication uses Docker's internal network (service names as hostnames). Only nginx binds to `0.0.0.0:80`.

**Environment file:** `/opt/checkers/.env` holds all secrets (DB credentials, JWT secret, Google OAuth keys). `DB_SYNC=false` after the initial schema creation run.

---

## Database Entities

The full backend uses TypeORM with the following entities mapped to PostgreSQL tables:

| Entity | Description |
|---|---|
| `User` | Account: username, email, passwordHash, OAuth provider info, avatarUrl, **country / countryCode**, **phone**, **pendingEmail / emailChangeToken / emailChangeTokenExpires** (email-change flow), progression (xp, credits, streak, totalWins, totalGames, firstWinBonus) |
| `Game` | A completed or ongoing game: players, rule set, result, timestamps |
| `Move` | Individual move within a game: from/to squares, piece type, timestamp |
| `Rating` | Glicko2 rating record per user: rating, deviation, volatility |
| `Tournament` | Tournament metadata: name, format, status, participants |
| `Friend` | Friend relationship between two users (bidirectional) |
| `Message` | Chat message between users: sender, recipient, content, timestamp |

---

## Auth System

The full backend supports two authentication strategies:

### Local Auth

- Password stored as a bcrypt hash
- Login returns a short-lived **access token** (15-minute expiry) and a long-lived **refresh token** (7-day expiry)
- Refresh tokens are rotated on each use
- Guards protect all authenticated REST and WebSocket routes

### Google OAuth

- OAuth 2.0 via Passport.js Google strategy
- On first login, a `User` record is created automatically
- Subsequent logins link by email

### Token Lifecycle

```
Login ──► access token (15m) + refresh token (7d)
              │
              ▼ (access token expires)
         POST /auth/refresh  ──► new access token + new refresh token
              │
              ▼ (refresh token expires or is revoked)
         Re-login required
```

---

## Rating System

Player ratings use the **Glicko2** algorithm. Glicko2 improves on Elo by tracking rating deviation (uncertainty) and volatility (consistency of performance).

Each `Rating` record stores:

| Field | Description |
|---|---|
| `rating` | Numeric skill estimate (default ~1500) |
| `deviation` | Uncertainty — decreases with more games played |
| `volatility` | How erratically the player's performance fluctuates |

Ratings are updated after each ranked game. Players with high deviation (few games played) experience larger rating swings. Ratings are rule-set-specific — a player has separate ratings for Russian, English, and International.

---

## Local Development

### HTML + Guest Relay Only (no DB needed)

```bash
# Terminal 1 — serve the HTML file
npx serve -l 4000 .

# Terminal 2 — start the relay
npm run start:guest   # listens on port 3000
```

Open `http://localhost:4000/checkers-final.html`.

### Full Backend

Requires a running PostgreSQL instance and Redis before starting.

```bash
# Start Postgres + Redis (however you have them set up locally)
# Then:
npm run start:dev
```

The Next.js frontend is in `frontend/` and connects to the NestJS API.

### Deployment

```bash
# Deploy updated HTML to the server
./update-html.sh

# Full deploy (relay + nginx)
./deploy.sh
```

SSH key for the server: `~/.ssh/checkers_deploy`  
Server: `130.12.242.84` (Ubuntu 24.04)
