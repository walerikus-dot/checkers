# 07 — Local Development Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 24 LTS | `winget install OpenJS.NodeJS.LTS` |
| npm | bundled with Node | at `C:\Program Files\nodejs\npm.cmd` |
| Git Bash or WSL | any | required for `ssh` / `scp` commands |

npm is at a non-standard path on Windows. Use the full path `C:\Program Files\nodejs\npm.cmd` anywhere a launcher or script calls npm directly (e.g., in `.claude/launch.json`).

---

## Running the Standalone Game

The HTML client has no build step. Serve it from any static file server:

```bash
# Via Claude Code launch config "Checkers Final (HTML)"
# Or manually:
"C:/Program Files/nodejs/npx.cmd" --yes serve -p 4000 "C:/Users/valer/Desktop"
```

Open in browser: `http://localhost:4000/checkers-final.html`

The game runs fully offline in this mode (AI and 2-player work; Online mode requires the relay also running).

---

## Running the Guest Relay Locally

The guest relay is a trimmed NestJS app that handles online room matchmaking. It requires no database or Redis.

```bash
cd backend
npm run start:guest
```

The relay starts on **port 3000**. The HTML client auto-connects to `http://localhost:3000/guest` when Online mode is selected and the page is served from localhost.

This is the only backend process needed for local online testing.

---

## Running the Full Backend

The full NestJS backend adds authentication, user accounts, and persistent game records. It requires Postgres and Redis to be running first.

```bash
# One-time setup: copy and fill in the env file
cp backend/.env.example backend/.env
# Edit backend/.env — set DB_HOST, DB_PORT, REDIS_URL, JWT_SECRET, etc.

# Start the full app in watch mode
npm run start:dev
```

Use this only when developing features that touch auth, user profiles, or the database. For online relay development, `start:guest` is faster and has no external dependencies.

---

## Running the Frontend

The Next.js frontend is a separate process from the backend.

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3001`. The frontend expects the backend (or guest relay) to be reachable on port 3000. Start the backend first.

---

## Claude Code Launch Configs

Defined in `.claude/launch.json`. Use these via the `preview_start` tool or the Claude Code UI to spin up servers without typing commands.

| Name | Command | Port |
|---|---|---|
| Checkers Final (HTML) | `npx serve -p 4000 Desktop\` | 4000 |
| Backend (NestJS) | `npm run start:guest` | 3000 |
| Frontend (Next.js) | `npm run dev` | 3001 |

Note: the HTML config uses `Desktop\` as the serve root so `checkers-final.html` is available at the root path.

---

## Common Issues

### `spawn npm ENOENT`

npm is not on PATH in the launch environment. Fix: use the full path in `.claude/launch.json`:

```json
"command": "C:\\Program Files\\nodejs\\npm.cmd run start:guest"
```

### `JwtStrategy requires a secret or key`

You ran `npm run start:dev` without a `.env` file. For relay-only work, use `npm run start:guest` instead — it does not load the auth module.

### `TypeORM connection refused`

The full backend cannot reach Postgres. Either start Postgres, or switch to `npm run start:guest` which skips TypeORM entirely.

### Socket connect timeout in browser

The HTML client is configured with `transports: ['polling', 'websocket']`. If only `['websocket']` is specified, the connection will fail in environments where the WebSocket upgrade is not immediately available. Keep polling as the first transport so socket.io can fall back gracefully.

### `Port 80 already in use` on server

nginx is running natively on the server. Do not add an nginx container to `docker-compose.yml`. The relay container should bind only to `127.0.0.1:3000`.

---

## RTK Token-Saving Commands

Always prefix commands with `rtk` to reduce token usage in Claude Code sessions.

```bash
# Git
rtk git status
rtk git diff
rtk git log

# Dev servers & tooling
rtk npm run dev
rtk tsc
rtk lint
```

See `~/.claude/CLAUDE.md` for the full RTK command reference and typical savings percentages.
