# Project Snapshot
_Updated: 2026-05-01_

## Done
- **Multi-capture UX fixes (deployed)** — status bar shows "⚡ Continue capturing!" / "⚡ Продолжите бить!" during forced chains, pulsing red dot, invalid-click flash on chain piece + valid destinations. Diagnosed from bug-2026-05-01T12-54-30-wxqd.json: user thought game was stuck mid-chain because UI gave no textual prompt
- **Bug-report improvements (deployed)** — description now mandatory (min 10 chars) with live validation; report payload now includes `uiState` (multiCapture, selectedCell, validMoves, firstClickDone) + `ai.aiThinking`/`aiWaitingForClick` for unambiguous diagnosis
- Full standalone HTML client (`index.html` = canonical source) — all rules, AI, online, themes, i18n
- Guest relay server (NestJS, Docker) — rooms, turn timer, reconnect, chat, draw offer
- Full backend deployed: Postgres + Redis + NestJS with auth
- PWA, Game History, Account management, Progression system (XP, credits, streak sync to server)
- Tournament system: Single Elimination + Round Robin, auto-scheduler, bracket viewer
- **Admin Tournament & Schedule UI** — new Tournaments + Schedules tabs in `admin.html` (create/start/cancel/result reporting, bracket modal, cron schedule manager with 4 presets); new `POST /api/tournaments/admin-create` admin-only endpoint
- **Global Tournaments panel** in `index.html` — floating 🏆 button next to ☰ opens overlay (`#trn-overlay`) with filter chips (All/Open/Live/Done); accessible from any mode without entering Online lobby
- **Double Elimination tournament format** — backend `generateDEBracket()` builds WB + LB + Grand Final, wires `nextMatchId` (winner) and `nextLoserMatchId` (loser drop); admin format dropdown adds DE option; smoke-tested live with 4-player bracket — winner+loser advancement both verified. v1 limitations: no GF bracket reset, simple loser-drop pairing, BYEs may leave LB slots empty (recommend power-of-2 player counts)
- **DE bracket viewer (Phase 6)** — both `index.html` `renderBracket()` and `admin.html` `renderBracketAdmin()` now render three colored sections: 🏆 Winners (teal), 🥈 Losers (amber), 👑 Grand Final (gold). SE/RR rendering unchanged.
- **Player-driven match play (Phase A)** — backend has `POST /api/tournaments/:tid/matches/:mid/{start-room,set-room,report}` (JWT, must be a match player); match entity has `roomId` + `gameStartedAt`. Bracket viewer in `index.html` shows "(you)" marker, highlights your match with `.bracket-match.me` glow, and renders inline `[✅ I won] [✕ I lost] [🤝 Draw]` buttons under each `ready` match where the current user is a player. Bracket polls every 8s while open. Players still find each other via the standard Online lobby — auto room creation deferred to Phase B.
- **Admin panel** (`admin.html`) — user stats, search, password reset, bug reports, Level/Credits/G/W/L/Ranked W/L/D columns
- **Forgot password flow** — JWT reset tokens, Gmail SMTP (walerikus@gmail.com), 15min expiry, HTML email
- **Server-side progression sync** — localStorage merges with server on login/register (Math.max for cumulative fields)
- **Google OAuth mobile fix** — GIS SDK for regular browsers, WebView detection with app-specific instructions (Telegram/Instagram/etc. → "Open in browser" message + copy link)
- **AI bot rewrite** — iterative deepening with time budgets, tiered evaluation per difficulty:
  - Easy: material-only eval, 200ms, 35% blunder rate
  - Medium: + positional awareness, 800ms, 5% blunder
  - Hard: + tactical eval (threats, protection, trapped pieces), 2s limit
  - Expert: + mobility, formations, vulnerability detection, 3.5s limit
  - Test results: Easy loses 100%, Medium 50/50, Hard wins 70%, Expert wins 100% vs reference player
- **Status bar** — initial message "Playing vs [Easy] bot. Your turn." with clickable difficulty cycling

## Problems
- Google OAuth requires Authorized JavaScript Origin `https://chashki.duckdns.org` (just added, may take hours)
- OAuth client is in "Zante Taxi" GCP project (project number 697809909252)

## Next steps
1. Test multi-capture flash live on chashki.duckdns.org (real device, mobile)
2. Wiki updates for: admin panel, forgot password, progression sync, AI rewrite, Google OAuth, multi-capture UX
3. Test AI difficulty in real gameplay (all 4 levels)
4. Google Ads integration
5. Matchmaking queue (Glicko-2 rating filter)

## Key files
- `index.html` — standalone game client (canonical source, deployed via scp)
- `admin.html` — admin panel
- `backend/src/auth/auth.controller.ts` — login, register, forgot/reset password, Google token login
- `backend/src/admin/` — admin API (stats, users, bug reports)
- `backend/src/users/user.entity.ts` — User entity with progression fields (xp, credits, streak, totalWins, totalGames, firstWinBonus)
- `ai-test.js` — AI difficulty test harness (node script)
- `wiki/` — project documentation

## Infra
- Domain: https://chashki.duckdns.org
- Server: root@130.12.242.84, key ~/.ssh/checkers_deploy
- All 5 containers running: backend, frontend, nginx, postgres (healthy), redis (healthy)
- HTML served from: /opt/checkers/nginx/html/checkers-final.html
- Backend on port 3001 inside Docker
- Admin key: ADMIN_SECRET env var
- SMTP: walerikus@gmail.com with app password in SMTP_PASS env var
