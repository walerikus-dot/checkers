# Checkers — Project Overview

## What Is This Project?

Checkers is a full-stack multiplayer board game application. It supports three international rule sets, an AI opponent at three difficulty levels, and real-time online multiplayer via WebSockets. The project ships in two forms:

1. **Standalone HTML client** (`checkers-final.html`) — a single self-contained file using vanilla JavaScript with no build step, styled with a cyberpunk dark theme. This is the primary deployed artifact and the only interface currently available to users.
2. **Next.js frontend** (`frontend/`) — a React 18 / Next.js 14 application wired to the full NestJS backend. Not yet deployed.

---

## Live URLs

| Resource | URL |
|---|---|
| Game client | `http://chashki.duckdns.org/checkers-final.html` |
| API base | `http://chashki.duckdns.org/api/` |
| Legacy IP | `http://130.12.242.84/checkers-final.html` (also works) |

---

## Development Roadmap — Fork A vs Fork B

When accounts and ratings were introduced, two implementation paths were considered:

### Fork A — Accounts in the HTML client ✅ COMPLETE

Small login/register modal in the HTML file. JWT stored in `localStorage`. Rated games recorded via REST API calls after each online game ends. A simple leaderboard panel (top players, ratings). Profile saved per account (name, rating per ruleset).

**Estimated:** 2–4 sessions. **Actual:** completed.

**What was built:**
- Login / Register modal in the HTML client (email + password)
- Google OAuth button wired to `chashki.duckdns.org` redirect
- JWT stored in `localStorage`; sent as `Authorization: Bearer` on every API call
- `POST /api/games/guest-result` — records winner/loser + updates Glicko2 ratings
- Leaderboard panel in the HTML client (top 10 by rating)
- Profile view in the auth modal (rating, W/L/D stats)
- PostgreSQL + Redis deployed as Docker services
- Full NestJS backend (`main.ts`) deployed on port 3001

### Fork B — Full stack 🔜 NEXT

Adds on top of Fork A:
- **Next.js frontend** — proper pages, routing, responsive UI
- **Friend system, messaging, game history** per user
- **Tournament bracket system**
- **Google OAuth login** (needs SSL for production approval)
- **Full match replay** — move-by-move history stored in DB

**Estimated:** 2–4 weeks.

**What is still missing:**
- Next.js frontend deployed (code in `frontend/`, not served)
- SSL / HTTPS (needed for Google OAuth production + secure cookies)
- `/game` WebSocket namespace UI (backend ready, no frontend)
- Match replay UI
- Friends, messaging, tournament UI

---

## Current State

### What Works Now

| Feature | Status |
|---|---|
| Standalone HTML client (all 3 rule sets) | ✅ Live at `/checkers-final.html` |
| AI opponent (easy / medium / hard) | ✅ Live |
| Online multiplayer (guest rooms, turn timer) | ✅ Live |
| Accounts — register / login (email + password) | ✅ Live |
| JWT auth (localStorage + cookie, auto-restore on page load) | ✅ Live |
| Persistent sessions — user stays logged in across restarts | ✅ Live |
| Google OAuth login | ✅ Configured — `chashki.duckdns.org` |
| Glicko2 ratings (updated after each online game) | ✅ Live |
| Leaderboard + Profile view in HTML client | ✅ Live |
| **Account management** — nickname editing, account deletion | ✅ Live |
| **Game History panel** — last 50 games in hamburger menu | ✅ Live |
| **PWA** — installable, manifest + Service Worker + SVG icons | ✅ Live |
| **Progression system** — XP, levels, credits | ✅ Live |
| **Pari-mutuel betting** — credit wagers, winnings in result panel | ✅ Live |
| **Game-over UX** — 3.5 s delay, win/lose chords, inline result panel | ✅ Live |
| **Opponent-left flow** — offers "Play vs Bot" or "Play Online" on rejoin | ✅ Live |
| **Mandatory capture indicator** — info bar notice in online games | ✅ Live |
| PostgreSQL + Redis (Docker) | ✅ Live |
| Full NestJS backend (port 3001, Docker) | ✅ Live |
| SSL / HTTPS (Let's Encrypt, auto-renews) | ✅ Live |
| **Next.js 14 frontend** | ✅ **Deployed at `https://chashki.duckdns.org/`** |
| Auth persistence across reloads (Zustand + cookie) | ✅ Live |
| Route guard middleware (protected pages) | ✅ Live |
| Sticky nav bar (Play, Leaderboard, History, Friends, Profile) | ✅ Live |
| Dashboard (quick play, private game, stats) | ✅ Live |
| Leaderboard page | ✅ Live |
| In-game board + chat (Next.js) | ✅ Live |
| Game history page (`/history`) | ✅ Live |
| User profile page (`/profile/[id]`) | ✅ Live |
| Friends page — list, requests, search & add (`/friends`) | ✅ Live |

### Remaining (Fork B)

| Feature | Status |
|---|---|
| Tournament bracket (Single Elimination + Round Robin + admin panel) | In progress |
| Matchmaking queue UI | Backend ready, no UI |
| Match replay viewer | Backend stores moves, no UI |

---

## Two Ways to Play

### Option 1: Standalone HTML Client (Current — Fork A)

Open `checkers-final.html` directly. Everything runs in the page. If you are logged in (via the auth modal), online game results are recorded and ratings are updated automatically.

### Option 2: Full Stack (Fork B)

The Next.js frontend connects to the NestJS backend for full features: matchmaking, persistent game history, friends, messaging, tournaments. Requires SSL and the Next.js frontend to be deployed.

---

## Supported Rule Sets

| Rule Set | Board | Kings | Capture Direction | Mandatory Capture |
|---|---|---|---|---|
| Russian | 8×8 | Flying (slide any distance) | Backward allowed | Yes |
| English | 8×8 | 1-step only | Forward only | Yes |
| International | 10×10 | Flying (slide any distance) | Backward allowed | Yes |

---

## AI Difficulty Levels

The AI uses Minimax with alpha-beta pruning. Search depth varies by difficulty:

| Level | Search Depth |
|---|---|
| Easy | 1 |
| Medium | 3 |
| Hard | 5 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Standalone client | Vanilla JavaScript, single HTML file |
| Frontend framework | Next.js 14, React 18 (not yet deployed) |
| Styling | TailwindCSS |
| State management | Zustand |
| Backend framework | NestJS 10 |
| ORM | TypeORM |
| Database | PostgreSQL 16 (Docker) |
| Cache / pub-sub | Redis 7 (Docker) |
| WebSockets | Socket.io 4.7 |
| Auth | JWT (access 15 m + refresh 7 d), Google OAuth 2.0 |
| Ratings | Glicko2 |
| Containerization | Docker Compose (5 services) |
| Web server | Nginx (Docker container, port 80) |
| Domain | `chashki.duckdns.org` → 130.12.242.84 |
| Server OS | Ubuntu 24.04 |
| Server IP | 130.12.242.84 |

---

## Repository Structure

```
Checkers/
├── checkers-final.html          # Standalone client — primary deployed artifact
├── C:\Users\valer\Desktop\      # Local copy of checkers-final.html (deploy source)
├── backend/
│   ├── src/
│   │   ├── guest/               # Guest relay (Socket.io /guest namespace)
│   │   ├── games/               # Game entity, service, REST, WebSocket gateway
│   │   │   └── engine/          # Pure game logic
│   │   ├── auth/                # JWT + Google OAuth strategies
│   │   ├── users/               # User entity & service
│   │   ├── ratings/             # Glicko2 rating system
│   │   ├── tournaments/         # Tournament management
│   │   ├── friends/             # Friend relationships
│   │   ├── messages/            # In-game chat
│   │   └── matchmaking/         # Quick-play queue
│   ├── Dockerfile               # Full backend image (node dist/main.js)
│   ├── Dockerfile.guest         # Relay-only image (node dist/guest-main.js)
│   ├── guest-main.ts            # Entry point — relay only (no DB)
│   └── main.ts                  # Entry point — full backend
├── frontend/                    # Next.js 14 application (not deployed)
├── nginx/
│   └── nginx.conf               # Docker nginx config (lazy DNS, /api/, /socket.io/)
├── docker-compose.yml           # 5 services: postgres, redis, relay, backend, nginx
├── .env.production              # Template for server .env (not committed)
├── deploy.sh                    # One-shot server deploy helper
├── update-html.sh               # Push HTML only (no rebuild)
└── wiki/                        # Project documentation
```
