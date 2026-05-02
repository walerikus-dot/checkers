# Checkers — Project Roadmap
_Last updated: 2026-04-22_

---

## ✅ Done

### Core Game Engine
- [x] Russian / English / International rules (8×8 and 10×10)
- [x] Flying kings (Russian & International)
- [x] Mandatory capture enforcement
- [x] Multi-capture chains
- [x] Minimax AI (easy / medium / hard) — **difficulty re-evaluation planned**
- [x] Move hints, coordinate labels, piece animations

### Standalone HTML Client (`checkers-final.html`)
- [x] Single-file, no build step — works offline and from server
- [x] Board flip when playing as Black — panels swap to match
- [x] Player status panels (top / bottom) with active-turn glow
- [x] Info status bar (middle panel, desktop right column)
- [x] Draw / Undo / Replay buttons with confirmation dialogs
- [x] Draw offer flow: AI declines if winning; 2P opponent prompt; online socket stubs
- [x] Move glow (gold = white, blue = black) and capture glow (red) with toggles
- [x] Move history strip (hamburger + side panel)
- [x] Themes: Eclipse, Amber Dark, Royal Wood, Neon Arcade, Slate Glass
- [x] Style customization (piece colors, board palette)
- [x] i18n: English / Russian

### Mobile Layout (HTML client)
- [x] Play / Lobby buttons top bar
- [x] Status bar under buttons
- [x] Player panels above/below board, swap on side change
- [x] Lobby modal: Host tab + Join tab with room list
- [x] Hamburger menu: Account / Language / Game Settings / Game Design groups

### Online Multiplayer
- [x] Guest relay (NestJS, no DB needed) via `/guest` socket.io namespace
- [x] Room create / join / rejoin (reconnect grace 30 s)
- [x] Turn timer: Off / 30 s / 60 s — enforced server-side
- [x] Smart matchmaking: join open room or auto-create
- [x] Left-during-game → opponent wins immediately
- [x] Bot placeholder rooms in room list

### Desktop / Web Layout
- [x] Left sidebar: ⚡ Play (matchmaking), 👥 Host, 🔍 Join Game with room list
- [x] Right column: Black panel → Info status → Undo/Draw/Replay → White panel
- [x] Panels stretch to board height; info bar fills remaining space

### Backend (Full Stack — server deployed)
- [x] NestJS API: JWT auth, Google OAuth, local login/register
- [x] User entity + profile (rating, wins, losses, games)
- [x] Glicko-2 rating system
- [x] Leaderboard REST endpoint
- [x] Tournament management (basic scaffold)
- [x] Friends system + real-time online status
- [x] In-game chat (messages entity)
- [x] Matchmaking queue

### Next.js Frontend (deployed, not primary client)
- [x] Dashboard, leaderboard, friends, profile pages
- [x] CheckersBoard component (touch, highlights, kings)
- [x] Auth pages (login / register / OAuth redirect)
- [x] Challenge friend → create private game → share link
- [x] Turn timer countdown on board

### Android (Expo / EAS)
- [x] Login / register / tabs scaffold (dashboard, leaderboard, friends, profile)
- [x] Lobby screen (create / join rooms)
- [x] Game screen (socket-connected, timer countdown, game-over overlay)
- [x] Checkers engine (TypeScript port)
- [x] EAS build submitted

### Infrastructure
- [x] Server: Ubuntu 24.04 @ 130.12.242.84
- [x] Docker Compose: relay + nginx (production)
- [x] nginx: `/socket.io/` → relay, `/checkers-final.html` → static
- [x] SSH deploy key + SCP update scripts

---

## 🔄 In Progress

- [ ] EAS Android APK — waiting on build / device testing
- [x] Online draw offer — ✅ relay wired in guest.gateway.ts (2026-04-22)
- [x] In-game chat — ✅ shipped (2026-04-22)
- [ ] Tournament bracket — TournamentParticipant entity + join endpoint + bracket UI
- [x] AI Web Worker — ✅ shipped 2026-04-22

---

## 🗺 Planned / Next Up

### 1. ✅ AI Web Worker + Difficulty Re-balance _(done)_
> Minimax now runs in a background Web Worker — UI stays fully responsive.

- [x] Worker embedded as Blob URL (compatible with single-file HTML)
- [x] `aiMove()` posts to worker; result handled by `_onWorkerResult()`
- [x] Graceful sync fallback if Workers unavailable
- [x] Difficulty re-tuned: Easy (depth 1, 50% random), Medium (depth 4), Hard (depth 7, full alpha-beta)
- [x] Improved `evaluate()`: king=5pts, advance bonus, center bonus, back-row defense
- [x] Gold status dot + localized text while AI is thinking

### 2. 🏆 Game Score, Leveling & Credit System
> Persistent progression for players.

- [ ] Credit currency (e.g. "Coins") earned by winning games, completing daily quests
- [ ] XP + level system: each game awards XP based on result, opponent skill, rules used
- [ ] Level badges shown on player panel and profile
- [ ] Credit rewards: win vs AI, win online, win streak bonuses
- [ ] Credit store: cosmetics (boards, piece skins, themes)
- [ ] Backend: `credits`, `xp`, `level`, `streak` fields on User entity
- [ ] REST endpoints: `GET /me/credits`, `POST /credits/award`

### 3. 📢 Google Ads Integration
> Optional ads — disabled by default, opt-in for credit rewards.

- [ ] Integrate Google AdSense / AdMob in HTML client and Expo app
- [ ] Ads **disabled** by default — user must opt in from settings
- [ ] "Watch ad → earn 10 credits" flow
- [ ] Ad placement: between games (never mid-game)
- [ ] Toggle in hamburger menu: Ads On / Off
- [ ] Ad revenue tracked per platform (web vs Android)

### 4. ✅ In-Game Chat _(done 2026-04-22)_

- [x] Chat panel in right column below white panel (desktop, online mode only)
- [x] Collapsible with 💬 toggle in mobile status bar, unread badge
- [x] Quick-message chips: GG 👍, Good luck 🍀, Nice move ✨
- [x] Free-text input, Enter-to-send
- [x] `game:chat` relay in `guest.gateway.ts` (200-char limit, sender name injected server-side)
- [x] Chat cleared on disconnect/new connection

---

## 🐛 Known Issues / Tech Debt

- Tournament bracket not implemented (no `TournamentParticipant` entity)
- Push notifications for friend challenges (share-link only currently)
- Mobile AI opponent mode (offline vs minimax) not yet in Expo app
- Backend `Game` entity has no `turnTime` field (relay timer works, stats don't track it)

---

## 📐 Architecture Snapshot

| Layer | Tech | Status |
|---|---|---|
| Standalone client | Vanilla JS HTML | ✅ Live |
| Guest relay | NestJS + Socket.io | ✅ Live (Docker) |
| Full backend | NestJS + PostgreSQL + Redis | ✅ Live (Docker) |
| Next.js frontend | Next.js 14 + TailwindCSS | ✅ Deployed |
| Android app | Expo (React Native) | 🔄 Build in progress |
| Web Worker AI | Vanilla JS Worker | 📋 Planned |
| Credit system | Backend + client | 📋 Planned |
| Ads | AdSense / AdMob | 📋 Planned |
| In-game chat | Socket relay + UI | 📋 Planned |
