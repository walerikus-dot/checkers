# Checkers — Project CLAUDE.md

## 🚀 MANDATORY SESSION INIT — runs automatically, no user command needed

**At the very start of every session, before doing anything else, execute these steps silently and report the result:**

1. Read `.claude/SNAPSHOT.md` — extract status, last done, next steps
2. Run `rtk git status` — note uncommitted files
3. Run `rtk git log --oneline -5` — note last commits
4. Check server: `ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 "docker ps --format 'table {{.Names}}\t{{.Status}}'" 2>&1`
5. Output exactly this block and nothing else, then wait for the user:

```
## ✅ Session Ready — Checkers
**Status:** <one sentence from SNAPSHOT>
**Last done:** <top 2 items from SNAPSHOT>
**Next up:** <top 2 items from SNAPSHOT>
**Git:** <clean / N uncommitted files — list them>
**Server:** <all running / list any stopped containers>
```

This block is the first thing the user sees. Do not greet, do not explain, do not ask questions — just run the init and show the block.

## ⚠ Wiki Update Rule

**Every change to this project must be reflected in `wiki/` before the task is considered done.**

This includes:
- New features or UI changes → update `05-ui-client.md`
- New / changed WebSocket events → update `04-api-reference.md` AND the event table in this file
- Architecture or infrastructure changes → update `02-architecture.md`
- Game engine changes (rules, AI, move logic) → update `03-game-engine.md`
- Deployment changes → update `06-deployment.md`
- Dev workflow / setup changes → update `07-development.md`
- Project-level schema or server info changes → update `01-overview.md` AND this file

When in doubt, update `wiki/README.md` quick-reference as well.

## Project Schema

```
Checkers/
├── CLAUDE.md                  ← this file
├── TESTING.md                 ← test scenarios and commands
├── index.html                 ← STANDALONE GAME CLIENT (copy of checkers-final.html)
├── deploy.sh                  ← one-shot server deploy helper
├── update-html.sh             ← push HTML only (no rebuild)
├── docker-compose.yml         ← relay + nginx for production
├── nginx/                     ← nginx config templates
├── roadmap/                   ← design docs & planning
│   ├── checkers-techspec.html ← full technical specification (bilingual)
│   ├── checkers-task-split.html ← AI vs human task breakdown
│   └── design-proposals.html  ← UI design proposals
├── wiki/                      ← project wiki (auto-generated)
│
├── backend/                   ← NestJS API + WebSocket server
│   ├── src/
│   │   ├── main.ts            ← full app entry (needs DB + Redis)
│   │   ├── guest-main.ts      ← guest-only entry (no DB needed) ← used in dev
│   │   ├── app.module.ts      ← root module
│   │   ├── auth/              ← JWT, Google OAuth, local strategy
│   │   ├── users/             ← User entity + CRUD
│   │   ├── games/             ← Game entity, service, REST, WebSocket gateway
│   │   │   └── engine/        ← Pure game logic (checkers.engine.ts)
│   │   ├── guest/             ← Guest relay (no auth, in-memory rooms)
│   │   │   ├── guest.gateway.ts        ← WebSocket /guest namespace
│   │   │   ├── guest-app.module.ts     ← minimal module for relay-only boot
│   │   │   └── guest.module.ts
│   │   ├── ratings/           ← Glicko2 rating system
│   │   ├── tournaments/       ← Tournament management
│   │   ├── friends/           ← Friend relationships
│   │   ├── messages/          ← In-game chat
│   │   ├── matchmaking/       ← Quick-play queue
│   │   └── moves/             ← Move history
│   ├── nest-cli.json          ← entryFile: guest-main (dev mode)
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/                  ← Next.js 14 + React 18 + TailwindCSS
│   ├── src/
│   │   ├── app/               ← App Router pages
│   │   ├── components/board/  ← CheckersBoard component
│   │   ├── hooks/             ← useGameSocket
│   │   ├── lib/               ← api.ts (Axios), socket.ts
│   │   ├── store/             ← Zustand auth store
│   │   └── types/             ← Game TypeScript interfaces
│   └── package.json
│
```

## What Runs Where

| Service | Local (dev) | Production |
|---|---|---|
| Game client | `http://localhost:4000/` (npx serve, index.html) | `https://chashki.duckdns.org/checkers-final.html` (nginx) |
| Guest relay | `http://localhost:3000` (npm run start:guest) | `https://chashki.duckdns.org/socket.io/` (Docker + nginx proxy) |
| Full backend | Not running (needs Postgres + Redis) | Planned |
| Frontend (Next.js) | `http://localhost:3001` (npm run dev) | Not deployed |

## Launch Configs (.claude/launch.json)

Three servers are configured for Claude Code preview:
1. **Checkers Game** — `npx serve -p 4000 Checkers/` → serves `index.html` (game) + `roadmap/` docs
2. **Backend (NestJS)** — `npm run start:guest` → guest relay only (no DB)
3. **Frontend (Next.js)** — `npm run dev` → Next.js on port 3001

## Key Architecture Decisions

- **`guest-main.ts`** bootstraps only `GuestAppModule` — no TypeORM, no JWT, no Redis. This lets the relay start locally without any infrastructure.
- **`main.ts`** bootstraps the full `AppModule` — requires PostgreSQL + Redis.
- The **standalone HTML** (`checkers-final.html`) contains 100% of the game engine in vanilla JS — no build step, no framework. It connects to the relay via socket.io.
- Online multiplayer uses a **room-based relay** (no server-side game validation) — clients run the engine, relay just forwards moves.

## 🎨 UI / Design Change Rule

**Before making any panel or layout change (desktop or mobile):**

1. Show two ASCII diagrams — one for mobile, one for desktop — depicting the proposed layout.
2. Wait for explicit user approval or corrections.
3. Only after approval: write code and deploy.

Never skip the diagrams step, even for "small" tweaks. This applies to: player panels, status bar, timer, stats, board wrappers, rules panel, and any other visible UI element.

## RTK Commands

Always prefix commands with `rtk`:
```bash
rtk cargo build / rtk npm run dev / rtk git status
```

## Server

- **Domain**: https://chashki.duckdns.org (HTTP → HTTPS redirect active)
- **IP**: 130.12.242.84
- **OS**: Ubuntu 24.04
- **SSH key**: `~/.ssh/checkers_deploy`
- **Game path**: `/opt/checkers/`
- **Web root**: `/var/www/html/`
- **Relay container**: `checkers-relay-1` (Docker, port 3000 on 127.0.0.1)
- **Nginx**: native systemd service, proxies `/socket.io/` → relay

## Update HTML on Server

```bash
# From project root (index.html is the canonical source):
scp -i ~/.ssh/checkers_deploy "C:/Users/valer/Documents/Claude/Projects/Checkers/index.html" root@130.12.242.84:/opt/checkers/nginx/html/checkers-final.html

# Desktop copy still works too:
# scp -i ~/.ssh/checkers_deploy "C:/Users/valer/Desktop/checkers-final.html" root@130.12.242.84:/opt/checkers/nginx/html/checkers-final.html
```

⚠️ **Important**: The Docker nginx serves from `/opt/checkers/nginx/html/` — NOT `/var/www/html/` (that's the unused native nginx).

## Game Rules Summary

| Ruleset | Board | Kings | Capture direction | Mandatory capture |
|---|---|---|---|---|
| Russian | 8×8 | Flying (any distance) | All directions | Yes |
| English | 8×8 | 1-step | Forward only | Yes |
| International | 10×10 | Flying (any distance) | All directions | Yes |

## Guest Room Events (WebSocket /guest namespace)

| Client → Server | Server → Client |
|---|---|
| `room:create {name, rules, code?, turnTime?}` | `room:created {roomId, color}` |
| `room:list` | `room:list [{id, hostName, rules, turnTime?, locked, status}]` |
| `room:join {roomId, name, code?}` | `room:joined {roomId, color, opponentName, rules, turnTime?}` |
| `room:rejoin {roomId, name}` | `room:opponent-joined {opponentName, color, rules, turnTime?}` |
| `game:move {roomId, fr, fc, tr, tc, capCell}` | `room:reconnected {color, opponentName, rules, turnTime?}` |
| `game:sync {roomId, board, turn, capturedByWhite, capturedByBlack}` | `room:opponent-reconnected {opponentName}` |
| `game:new roomId` | `room:opponent-reconnecting {timeout}` |
| `room:leave roomId` | `room:opponent-left-win` |
| | `room:host-left` / `room:guest-left` |
| | `game:move {fr, fc, tr, tc, capCell}` |
| | `game:sync {board, turn, capturedByWhite, capturedByBlack}` |
| | `game:new` |

## Online Rules

- **Leave during game** → opponent wins immediately (`room:opponent-left-win`)
- **Disconnect grace** → 30 seconds for the socket to reconnect; opponent sees a notice; if time expires the remaining player wins
- **Turn timer** → host sets Off / 30 s / 60 s at room creation; both clients run identical countdowns; when it hits 0 the active player loses the match
- **Reconnect flow** → rejoiner emits `room:rejoin`; host sends `game:sync` so rejoiner gets the current board state
