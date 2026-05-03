# Project Snapshot
_Updated: 2026-05-03_

## Done (recent)
- **UI sweep — combined panel & swap** — combined player-panel now visible on desktop; only avatars move during swap (drag the circle past timer, or long-press 1.2 s to fade-swap, or Space-hold for keyboard). Halves stay anchored. Black ring=ivory, White ring=accent. `_canSwapNow()` blocks swap during a live AI game with info-bar warning.
- **Tip rotator + status pruning** — every ~30 s a random tip types into the info bar (4-tip pool: timer, hold-avatar, drag-halves, tap-nick). Skips while a real status (capture/AI thinking/game-over) is active. "Your turn / Opponent's turn" chatter removed; only mandatory captures + welcome greeting + game-over fill the bar.
- **Random guest name** — adjective.animal generator on first launch (~75×80 combos: brave.goose, sly.scorpion, …). Tap the nick on Progress panel to re-roll; ✏️ pen appears for 4 s post-click for inline custom edit. Logged-in users edit via Profile.
- **Profile redesign** — board-footprint inline panel (no fullscreen modal). Avatar+name+country header, gold balance chip top-right, Ranked/General tabs (5 stats × 2 rows), Edit account / Log out anchored bottom. Edit profile → Username, Email (changeable via re-confirm flow), Change password sub-panel, Country picker (custom typeahead, 123 entries, fixed-position popup), Telephone with auto dial-code prefix. Delete account moved into Change-password panel as 2-step (confirm → password); backend verifies bcrypt.
- **Auth/Tournaments/Lobby/Play panels all converted to inline** — board-footprint slot replaces `.board-outer` while open; `_hideAllInlinePanels()` ensures opening one closes all others. Tournaments has 🏆 + 🏅 Leaderboard tabs in header, sort chips for leaderboard (Rating/Winrate/Wins/Games), refresh + close in header. Spectate placeholder tab in Play panel.
- **Mobile top action bar** — `[⚡ Play] [🎮 Lobby] [🏆] [☰]` (trophy + hamburger inline, hamburger stays fixed for menu z-index correctness). New / Draw / Undo moved to a bottom bar (`#mob-bottom-bar`).
- **Tap-to-start vs AI** — when player is Black, AI-first overlay removed; tap any board cell to fire AI's opening move. Info-bar tip "👆 Tap the board to start".
- **Win/lose info bar coloring** — green "🏆 You win!" + red "💀 {Difficulty} bot lost" / "{opponent} lost", amber draws, accent level-ups. HTML spans via `txt.innerHTML`.
- **Country backend** — `User.country/countryCode` columns; geo-IP auto-detect on first profile open; manual edit persisted via `PUT /api/users/:id`. Phone, pendingEmail, emailChangeToken/Expires also added.
- **Email-change flow** — `POST /auth/request-email-change` (verifies password, sends 24 h confirmation link); `POST /auth/confirm-email-change` (atomically applies). New keys/columns in user.entity, controllers, frontend.
- **Change-password endpoint** — `POST /auth/change-password` (current+new, bcrypt verify, 8+ chars). Replaces forgot-password detour from profile.
- **Leaderboard hardening** — `getLeaderboard/search/findOne` now project safe public fields only (no passwordHash leak). Sort by `?sort=rating|winrate|wins|games`. Excludes users with no Rating row.
- **Language persistence** — `lang` saved to localStorage; `setLanguage` restores on init via DOMContentLoaded.

## Problems
- Google OAuth requires Authorized JavaScript Origin `https://chashki.duckdns.org`
- OAuth client lives in "Zante Taxi" GCP project (697809909252)
- Mid-game swap blocked client-side only — server doesn't enforce.
- AI/offline win credits not synced to server (Phase 5 server-authoritative regression).

## Next steps
1. Wiki sweep — bring `wiki/05-ui-client.md` and `wiki/04-api-reference.md` in sync with all UI/API changes since auth panel.
2. Merge Quick-Game and Lobby-Host into a single panel (open question, see chat history).
3. Spectate tab — wire to live-rooms list.
4. Server-side game-award endpoint with rate limit.

## Key files
- `index.html` — single-file standalone game client (canonical source, deploy via scp).
- `admin.html` — admin panel SPA.
- `backend/src/{auth,users,games,tournaments,bets,...}` — NestJS modules.
- `wiki/` — project docs (maintain on every change).
- `scripts/` — codebase scan helpers (translation-scan, hardcoded-scan, find-*).
- `.claude/SNAPSHOT.md` — this file.

## Infra
- Domain: https://chashki.duckdns.org · Server: root@130.12.242.84 · Key: ~/.ssh/checkers_deploy
- Containers: backend, frontend, nginx, postgres (healthy), redis (healthy).
- HTML served from `/opt/checkers/nginx/html/checkers-final.html` (Docker nginx).
- SMTP: walerikus@gmail.com with app password in SMTP_PASS env var.
