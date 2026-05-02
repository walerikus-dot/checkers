# 05 — UI Clients

## Next.js Frontend (`https://chashki.duckdns.org/`)

The full React/Next.js 14 frontend is deployed and serves the main application.

### Pages

| Route | Description |
|---|---|
| `/` | Landing — Play Now / Sign In |
| `/auth/login` | Email + password login |
| `/auth/register` | Account registration |
| `/dashboard` | Quick play, private game creation, rating stats |
| `/leaderboard` | Top 50 players by Glicko2 rating |
| `/history` | Current user's completed games |
| `/profile/[id]` | Any user's profile — stats, recent games, add friend |
| `/friends` | Friends list, pending requests, player search |
| `/tournaments` | Tournament list + create form |
| `/tournaments/[id]` | Tournament detail — status, start button for organiser |
| `/replay/[gameId]` | Move-by-move game replay with playback controls |
| `/play/[gameId]` | Live game board + chat |

### Navigation

Sticky top nav bar on all authenticated pages. Links: **Play → Leaderboard → History → Tournaments → Friends**. Right: avatar → own profile, Logout button.

### Auth Flow

- Login stores `accessToken` in Zustand (persisted to `localStorage` via `zustand/middleware`)
- Cookie `checkers-auth-token` written on login for server-side route guard
- `src/middleware.ts` protects `/dashboard`, `/play/*`, `/profile/*`, `/history/*`
- Auth pages redirect to `/dashboard` if already logged in

### Key Source Files

| File | Purpose |
|---|---|
| `src/components/Nav.tsx` | Sticky nav bar, auth-aware |
| `src/middleware.ts` | Edge route guard via cookie |
| `src/store/auth.store.ts` | Zustand + persist (localStorage + cookie sync) |
| `src/lib/api.ts` | Axios with 401 auto-refresh; all API modules |
| `src/lib/socket.ts` | socket.io `/game` namespace (relative URL in prod) |
| `src/hooks/useGameSocket.ts` | Real-time game state hook |
| `src/components/board/CheckersBoard.tsx` | Interactive board, dynamic 8×8 or 10×10 |
| `src/components/game/GameChat.tsx` | In-game chat with quick messages |
| `src/lib/engine.ts` | Copy of the backend game engine for client-side replay reconstruction |
| `src/app/replay/[gameId]/page.tsx` | Replay page — board snapshots, step controls, move list |
| `src/app/tournaments/page.tsx` | Tournaments list + inline create form |
| `src/app/tournaments/[id]/page.tsx` | Tournament detail + organiser start button |

### Replay Page

Loads a completed game via `GET /api/games/:id` (which includes the `moves` array). Reconstructs every board state by calling `createInitialBoard(rulesType)` then `applyMove()` for each move — no backend endpoint needed.

Controls: ⏮ ◀ ▶/⏸ ▶ ⏭, range scrubber, 900 ms auto-play interval. Clicking a row in the move list jumps directly to that step. King promotions marked with ♛.

### Matchmaking (Dashboard)

`POST /api/games/quick-play` returns immediately with `{status: 'waiting', position}` or `{status: 'matched', gameId}`. The dashboard polls every 3 seconds until a match is found, then redirects to `/play/[gameId]`. Cancel calls `DELETE /api/games/quick-play`.

---

## Admin Panel (`/admin.html`)

Single self-contained admin SPA gated by `X-Admin-Key`. Lives at `https://chashki.duckdns.org/admin.html`. No build step.

### Tabs

| Tab | Purpose |
|---|---|
| Dashboard | Total/online users, game counts, 30-day registration bar chart |
| Users | Searchable, sortable user table with detail modal + password reset |
| Bug Reports | View and delete submitted bug reports |
| **Tournaments** | Create / Start / Cancel tournaments; bracket modal with admin "Win" / "Draw" buttons per match |
| **Schedules** | Create / enable / disable / delete cron-based recurring tournament schedules |

### Tournaments tab

- Create form: name, format (SE / RR / **DE**), rules (RU / EN / INT), maxPlayers, optional `startsAt` datetime → `POST /api/tournaments/admin-create`
- Filter dropdown: all / pending / active / completed / cancelled
- Per-row actions: **▶ Start** (pending only), **✕ Cancel** (pending or active), **👁 View** (active or completed)
- Bracket modal:
  - SE → round-by-round match list, winner highlight
  - RR → standings table (W/D/L/Pts) + match list
  - **DE → three colored sections**: 🏆 Winners (teal) · 🥈 Losers (amber) · 👑 Grand Final (gold)
  - For matches in `ready` status: **Win 1 / Win 2 / Draw** buttons → `POST /api/tournaments/:id/matches/:matchId/result`

### Schedules tab

- Create form: name, format, rules, maxPlayers, **cron expression** (free text), `registrationHours`, enabled toggle
- 4 cron presets: Daily 18:00 · Weekly Fri 18:00 · Weekly Sat 12:00 · Every 6h
- Per-row: enable/disable toggle (`PATCH /api/tournaments/schedules/:id`), delete button
- Lists `nextRunAt` computed from cron expression

### Auth

`X-Admin-Key` header set from session storage. Login screen prompts for the key, validates against `GET /api/admin/stats`. No backend session — key stays in `sessionStorage` until logout.

---

## Standalone HTML Client (`/checkers-final.html`)

### Tournaments Panel (global)

A floating **🏆** button at top-right (next to the ☰ hamburger) opens a full Tournaments overlay from any mode — no need to switch to Online.

| Element | Selector | Role |
|---|---|---|
| Floating button | `#trn-fab` | Opens panel; click `openTrnPanel()` |
| Overlay backdrop | `#trn-overlay` | Click outside modal to close |
| Modal card | `#trn-modal` | 520px centered desktop / full-screen sheet on mobile (≤640px) |
| Filter chips | `#trn-filter-chips` | All / Open / Live / Done — `setTrnFilter(f, btn)` |
| Tournament list | `#trn-global-list` | Rendered by `_renderTrnInto()` |

`loadTournaments()` / `trnJoin()` / `viewBracket()` are reused — the Online-lobby `#trn-list` and the global `#trn-global-list` stay in sync via `renderTournamentList()` which writes to both. Bracket overlay (`#bracket-overlay`) is the same one used by the lobby version.

### Bracket viewer (`renderBracket()`)

The shared bracket overlay (`#bracket-overlay` → `#bracket-body`) renders three layouts depending on `data.format`:

| Format | Layout |
|---|---|
| `single_elimination` | Linear columns of round labels via `_renderRoundsCols()` |
| `round_robin` | Standings table (W/D/L/Pts) + match list grouped by round |
| `double_elimination` | Three colored sections: 🏆 Winners (`.de-wb`, teal) · 🥈 Losers (`.de-lb`, amber) · 👑 Grand Final (`.de-gf`, gold). Rounds are split by `data.rounds[].bracket` field returned by the API. |

Mobile: DE sections stack vertically; rounds inside each section also stack instead of being side-by-side columns.

### Overview

The primary game client is a single self-contained file:

- **Local path:** `C:\Users\valer\Desktop\checkers-final.html`
- **Live URL:** `http://130.12.242.84/checkers-final.html`
- **Served from:** `/opt/checkers/nginx/html/checkers-final.html`
- **Dependencies:** zero local dependencies; only `socket.io` loaded from CDN
- **No build step** — edit and deploy via SCP

Deploy command:
```bash
scp -i ~/.ssh/checkers_deploy "C:/Users/valer/Desktop/checkers-final.html" \
  root@130.12.242.84:/opt/checkers/nginx/html/checkers-final.html
```

---

### Desktop Layout (>640px)

Three-column flex row:

```
┌─────────────┐  ┌────────────────────┐  ┌─────────────┐
│  Left Panel │  │       BOARD        │  │ Black panel │  order:1
│  (sidebar)  │  │   (board-wrapper)  │  │─────────────│
│  ⚡ Play    │  │                    │  │ Info status │  order:2 (flex:1)
│  👥 Host   │  │                    │  │─────────────│
│  🔍 Join   │  │                    │  │ 🤝  ↺  ⟵  │  order:3
│  Room List │  │                    │  │─────────────│
└─────────────┘  └────────────────────┘  │ White panel │  order:4
                                          └─────────────┘
```

- **Left panel** (`#left-panel`, 200px): Play (matchmaking), Host (create room), Join Game (foldable room list with refresh)
- **Board wrapper**: board, coordinate labels, timer ring
- **Right column** (`panels-right`, 180px flex column):
  - `#panel-black` / `#panel-white` — player cards (avatar, name, piece count, captured)
  - `.right-mid` — info status bar (fills remaining height with `flex:1`)
  - `#undo-panel` — three icon buttons: 🤝 Draw · ↺ New Game · ⟵ Undo
- Panel order swaps when playing as Black (or online as Black): white moves to order:1, black to order:4

### Mobile Layout (≤640px)

Vertical flex column via CSS `order`:

```
[ ⚡ Play ]  [ 🎮 Lobby ]     ← board-controls (always visible)
[ Status bar  |  Undo ]       ← mob-status-bar (hidden when idle; shows for online states)
┌──────────────────────────┐
│ panel-black   order:1    │
└──────────────────────────┘
┌──────────────────────────┐
│       BOARD   order:2    │
└──────────────────────────┘
┌──────────────────────────┐
│ panel-white   order:3    │
└──────────────────────────┘
```

- **board-controls**: Play button (⚡, opens Quick Game overlay), Lobby button (🎮, opens Host/Join modal)
- **mob-status-bar**: shown for special states (searching, waiting for opponent, online playing). Hidden when idle — `updateMobStatusBar()` adds `.mob-sb-idle` class
- Panels swap order when playing as Black (same JS logic as desktop)

---

### Hamburger Menu

Fixed top-right (≡). Two-level accordion: top items expand sub-items; group headers expand entire sections.

```
Account        (expand: profile / login)
Language       (expand: EN / RU pills)
────────────────────────────
⚙ Game Settings   (group header → toggleGroup('gamesettings'))
  Rules            (expand: Russian / English / International pills)
  🕹 Game Mode     (expand: vs AI / 2-Player / Online pills)
  Difficulty       (expand: Easy / Medium / Hard pills, frozen if not AI)
  📜 Move History  (expand: inline history list)
────────────────────────────
🎨 Game Design    (group header → toggleGroup('gamedesign'))
  Board            (expand: play-as, coords, hints, animations, move/capture glow)
  🖌 Style         (expand: piece color presets, board size/piece size sliders)
  Themes           (expand: Eclipse / Amber Dark / Royal Wood / Neon Arcade / Slate Glass)
```

Group headers call `toggleGroup(id)` which toggles `.open` on `#grp-{id}` and rotates the arrow via `#grp-arr-{id}`.
Sub-items call `toggleSub(id)` which toggles `.open` on `#sub-{id}`.

---

### Auth / Profile Panel (`#auth-inline`)

A board-footprint inline panel that occupies the same slot as `#mob-play-inline` / `#mob-lobby-inline` — when it opens, `.board-outer` is hidden and the panel takes its place. Triggered by hamburger → "Log in" / "Register" / "My Profile" via `openAuthModal()`. The panel is auto-relocated into `.board-wrapper` on first open.

**States** (one shown at a time, swapped via `display`):

| Container | Shown by | Contents |
|---|---|---|
| `#auth-form-wrap`         | `showFormWrap()` (logged out)  | Login / Register tabs, Email + Password, **Log in** + **Forgot password?** in one row, "or", Continue with Google |
| `#auth-forgot-wrap`       | `showForgotPassword()`          | Email → "Send Reset Link" |
| `#auth-reset-wrap`        | `showResetPasswordForm(token)` (URL hash `#reset_token=…`) | New password + confirm |
| `#auth-profile`           | `showProfile()` (logged in)     | Avatar (top-left), nickname + ✏️ + country line (right of avatar), Rating, Wins/Losses/Games, **Log out** + **🗑 Delete account** in one row anchored to bottom |
| `#prof-edit`              | `profStartEditNick()`           | Username, Email (editable — triggers email-change flow), **Change password** button, **Country & telephone** (single combined field: a clickable chip-button on the left shows the country flag + dial code (e.g. `🇬🇷 +30 ▾`), clicking it opens a search-driven dropdown with all 123 countries; phone number input on the right is fully optional). Country state lives in `_peCountrySel = {cc, name, dial}` and is sent as `country` + `countryCode` independent of whether a phone number is filled in. Cancel/Save. |
| `#prof-change-pwd`        | `profEditChangePassword()`      | Current password, New password, Confirm new password, Cancel/Save → `POST /api/auth/change-password` |
| `#prof-change-email`      | `profOpenChangeEmail(newEmail)` | New email, Current password, Cancel / Send confirmation → `POST /api/auth/request-email-change` (24h link emailed) |

**Result-panel chip overlap:** `#game-result-inline.minimized` floats `position:absolute` in the top-right corner of the board area (`z-index:30`), showing only the maximize ▴ and close ✕ buttons; the board behind stays fully interactive.

**Country resolution order** (`_populateProfileCountry()`):
1. `authUser.country` / `authUser.countryCode` from `/auth/me`
2. `localStorage.profile_country` cache (paint-fast fallback)
3. Geo-IP (`https://ipapi.co/json/`) — only if server has no value yet; the detected value is `PUT` back to the server so it persists across devices.

**Email change flow:**
- User edits the Email field in `#prof-edit` and presses Save → frontend detects the change and routes to `#prof-change-email`.
- After password verification, backend stores `pendingEmail` + `emailChangeToken` (24h) and emails a confirmation link to the **new** address.
- The link points at `…#confirm_email=<token>` on the game client. `handleConfirmEmailFragment()` posts the token to `POST /api/auth/confirm-email-change`, which atomically swaps `email ← pendingEmail` and clears the pending fields. A toast confirms the change and `/auth/me` is refetched.

**Win / lose result panel (`#game-result-inline`):**
- After `showWin()`, the inline panel fades in with: emoji, title, **🏆 Winner / 💀 Loser** lines (separate rows), sub message, and a **Play again** button.
- Top-right always carries minimize ▾ and close ✕ (maximize ▴ replaces ▾ when minimized). Minimized state hides title/emoji/sub/meta/actions and floats as a small chip over the board.

---

### Lobby Modal (Mobile)

Opened by 🎮 Lobby button. Center-screen card overlay (`mob-overlay-top`).

**Host tab:**
- Name field
- Key field (always visible, greyed when toggle off; green + copy-on-click when enabled)
- Turn timer pills: Off / 30s / 60s
- Create / Cancel buttons

**Join tab:**
- Room list (auto-refreshes on tab switch via `mobJoinRefresh()`)
- Code field for locked rooms
- Refresh / Cancel buttons

Tab switch calls `mobSwitchTab('host'|'join')`.

---

### Player Panels

Each panel (`#panel-black`, `#panel-white`) is a card with:
- Avatar circle (color-coded, pulses when active turn)
- Player name + online badge
- Piece count
- Captured pieces display (mini piece icons)
- Panel border glows gold (white active) or purple (black active)

**Active-turn glow**: panel border is static glow; avatar inside pulses via `avatarPulseWhite` / `avatarPulseBlack` keyframes.

---

### Info Status Bar (`.right-mid`)

Desktop: card between player panels, `flex:1` height. Content aligned top-left, wraps for longer messages.
Shows: status dot + text from `renderStatus()` → `status-text` element.

Mobile: hidden (`display:none!important`). Mobile status is in `mob-status-bar` instead.

---

### Undo / Draw / Replay Panel (`#undo-panel`)

Three icon-only buttons in one row, evenly distributed:

| Button | Icon | Tooltip | Action |
|---|---|---|---|
| Draw | 🤝 | "Offer Draw" | `offerDraw()` — confirm → AI evaluates / 2P prompt / online socket |
| New Game | ↺ | "New Game" | `confirmNewGame()` — skips confirm if game not started or over |
| Undo | ⟵ | "Undo Move" | `undoMove()` — disabled in online mode |

Desktop only — hidden on mobile (`display:none!important`).

---

### Draw Offer System

Shared modal (`#draw-modal`) reused for draw, new game confirmation, and AI decline messages.
State machine via `_drawPendingStep`:

| Step | Trigger | Modal content |
|---|---|---|
| `'confirm'` | Player clicks Draw | "Are you sure you want to offer a draw?" |
| `'opponent'` (2P) | Confirming player confirmed | "Opponent, do you accept?" |
| `'newgame'` | Player clicks ↺ | "End current game and start new?" |
| `'info'` | AI declines / opponent declines | "Draw declined. Game continues." |
| `'opponent'` (online) | `game:draw-offer` received | "Opponent offers draw. Accept?" |

AI draw evaluation: calls `evaluate(board)`. Score >150 (AI winning as White) or <-150 (AI winning as Black) → AI declines.

---

### Move / Capture Glow

Applied in `renderBoard()` based on `mustCapSet` and `canMoveSet`:

- **`must-capture` class** → red pulse animation (`mustCaptureGlow`) on pieces that must capture
- **`can-move` class** → gold pulse (`moveGlowWhite`) or blue pulse (`moveGlowBlack`) on pieces that can move (only when no captures available)
- Both toggleable via board settings: `showMoveGlow`, `showCaptureGlow`

Only shown for the current player's pieces during their turn (blocked in AI thinking, online opponent's turn).

---

### Multi-Capture Continuation Prompt

When a forced multi-capture chain is active (`multiCapture` is set), the UI overrides normal status to make the obligation unmistakable:

- **Status text** → `t('continueChain')` — "⚡ Continue capturing!" / "⚡ Продолжите бить!"
- **Status dot** → red, pulses with `mustCaptureGlow` animation
- **Invalid clicks** during a chain → `_flashChainHint(r,c)` pulses both the chain piece (`multiCapture`) and all valid destinations (`validMoves`) with the `chain-flash` keyframe; status text color-flashes via `chain-flash-text`

Implemented in `renderStatus()` (override branch when `multiCapture && isMyTurn()`) and `onCellClick()` (calls `_flashChainHint` when click target is not in `validMoves`).

---

### Bug Report

Modal `#bug-report-modal` — opened via `bugReportOpen()` from the hamburger menu.

- **Description is required** (min 10 chars). `_bugReportValidate()` runs onInput: red border + dimmed Send button until valid. `bugReportSend()` rejects short input with a 2.5s warning before reset.
- **Payload** built by `_buildBugReport()` includes: `description`, `game` state, `ai` flags (`workerAvailable`, `depth`, `randomness`, `aiThinking`, `aiWaitingForClick`), `uiState` (`multiCapture`, `selectedCell`, `validMoves`, `firstClickDone`), `board`, `boardAscii`, `moveLog`, `lastMove`, `moveHistory` (snapshots), `boardFinal`.
- POSTed to `/api/bug-report` (proxied to backend on prod; localhost:3001 in dev). Server stores under `/opt/checkers/bug-reports/bug-<timestamp>-<rand>.json`.
- Three actions: 🚀 Send to server / 📋 Copy / 💾 Download JSON.

---

### Cyberpunk Dark Theme

| Role | Value |
|---|---|
| Background | `#0e0e12` |
| Surface | `#18181f` |
| Accent (purple) | `#7c5cfc` |
| Accent2 (red) | `#ff6b6b` |

Fonts: **Playfair Display** for headings, **DM Mono** for body and code — both loaded from Google Fonts.

---

## CSS Variables

### Layout & Palette

```
--bg          page background
--surface     card / panel background
--border      subtle border color
--accent      primary purple (#7c5cfc)
--accent2     red highlight (#ff6b6b)
--gold        gold highlight
--text        primary text
--muted       secondary/disabled text
--online      online status green (#00d4aa)
```

### Board Geometry

```
--board-sz    min(440px, 88vw)   — responsive board size
--frame       14px               — board frame/padding
--piece-inset 8%                 — gap between piece edge and cell edge
```

### Piece Gradient Colors

```
--dp-hi / --dp-mid / --dp-lo    dark piece gradient (top → mid → shadow)
--lp-hi / --lp-mid / --lp-lo   light piece gradient (top → mid → shadow)
```

These vars are overridden by the color preset system, so swapping a preset changes every piece simultaneously without touching JS.

---

## PWA — Progressive Web App

The standalone HTML client is installable as a PWA on any device.

| File | Role |
|---|---|
| `/manifest.json` | App manifest — name, theme color, icons, `display: standalone` |
| `/sw.js` | Service Worker — offline caching of the HTML client shell |
| `/icon-192.svg`, `/icon-512.svg` | SVG icons for home screen and splash screen |

The manifest is linked in the `<head>` of `checkers-final.html`. The Service Worker is registered on page load via a standard `navigator.serviceWorker.register('/sw.js')` call.

**Install prompt:** When the browser decides the install criteria are met (repeat visits, HTTPS, manifest present), it fires `beforeinstallprompt`. The client captures this event and shows a small install banner. Accepting triggers `prompt()` on the captured event.

---

## Game History Panel

Accessible via the hamburger menu → **📜 Move History** sub-item (this section was renamed from the per-game move list to the session history panel).

- Tracks the **last 50 completed games** across all sessions, stored in `localStorage` under the key `checkers_history`.
- Each entry records: opponent name (or "AI Easy/Medium/Hard" / "Player 2"), result (`win` / `loss` / `draw`), ruleset, game mode, pari wager and winnings (if a bet was placed), and timestamp.
- The panel renders as a scrollable list inside the hamburger menu, newest entry at the top.
- History persists across page reloads and browser restarts.
- Entries are added by `recordHistory(entry)` called from the game-over flow, after the result is determined and any pari settlement is complete.

---

## Progression System

The client tracks per-account progression in `localStorage` (key: `checkers_progress`):

| Field | Description |
|---|---|
| `xp` | Experience points — earned by completing games |
| `level` | Derived from XP thresholds (1 → ∞) |
| `credits` | In-game currency — earned via XP milestones and pari winnings |

XP is awarded on game completion based on mode and result:
- Win vs AI: +10 XP (Easy), +20 XP (Medium), +40 XP (Hard)
- Win online: +50 XP
- Loss: +5 XP (participation)
- Draw: +10 XP

Level thresholds follow a quadratic curve: `level = floor(sqrt(xp / 100)) + 1`.

Credits are displayed alongside the username in the auth button and in the profile view.

---

## Pari-Mutuel Betting

A credit wagering system for online games between two logged-in players.

### How It Works

1. Before an online game starts, each player can optionally place a credit bet (`setPari(amount)`).
2. Bets are stored locally; neither player sees the other's bet until the game ends.
3. On game-over, `settlePari(result)` computes the payout:
   - **Winner** receives their own bet back + the opponent's bet amount (net gain = opponent's stake).
   - **Loser** forfeits their bet.
   - **Draw** — both bets are returned.
4. Winnings are shown in the inline result panel after the 3.5-second dramatic delay.
5. Pari state (`pariAmount`, `pariOpponentAmount`) resets to zero when either player exits the room or starts a new game.

### UI

- A small bet input appears in the online `playing` view once both players are in the room.
- The result panel shows: `Pari: +N credits` (win) or `Pari: −N credits` (loss) or `Pari: returned` (draw).

---

## Game-Over UX

When a game ends (win, loss, or draw), the result sequence is:

1. **Last-move sound plays immediately** — `sfxLastMoveWin` (ascending chord, 4 notes) on victory; `sfxLastMoveLose` (descending chord, 4 notes) on defeat. Both use the Web Audio API tone synthesizer.
2. **3.5-second delay** — the board remains interactive-looking during this window, allowing the dramatic sounds to complete before the panel appears.
3. **Inline result panel appears** — replaces the info status bar area (`.right-mid`). Shows result text, rating delta (online), pari settlement, and two action buttons.
4. **Panel controls**: minimize button collapses the panel back to the status bar height; close button dismisses it entirely. The full-screen overlay was removed — the inline panel is the only result UI.

The delay is implemented with `setTimeout(showResultPanel, 3500)` inside `gameOver()`.

---

## Opponent-Left Flow

When `room:opponent-left-win` is received (opponent disconnected or left mid-game), the client:

1. Declares the local player the winner and settles any pari.
2. After the result panel is dismissed (or immediately if the panel is closed), checks if the opponent slot is empty.
3. Presents a choice modal: **"Play vs Bot"** or **"Play Online"**.
   - **Play vs Bot** — switches to AI mode, same ruleset, new game immediately.
   - **Play Online** — returns to the online lobby view so the player can join or create another room.

This replaces the previous behavior of simply showing "opponent left" with no follow-up action.

---

## Mandatory Capture Indicator

In online games, when the current player has at least one forced capture available, the info status bar displays:

```
⚠ Capture required
```

This notice appears via `renderStatus()` when `mustCapSet.size > 0` and the game mode is online. It is shown alongside (not instead of) the turn indicator. The text is translatable (`captureRequired` key in `TR`).

---

## Auth Button & Modal (Fork A)

### Auth Button

A fixed-position button in the top-left corner of the page. Its label reflects auth state:

- Not logged in: **"Log in"**
- Logged in: the user's **username**

Clicking the button opens the Auth Modal.

### Auth Modal

A centered overlay with two entry states and one logged-in state:

**Login tab** — fields: Email, Password; button: "Log in". On success, stores the JWT access token in `localStorage` and populates `authUser`.

**Register tab** — fields: Username, Email, Password; button: "Register". On success, automatically logs in.

**Profile view** (shown when already authenticated) — displays:
- Username (inline-editable — click to reveal a text field + Save button; calls `PATCH /api/users/username`)
- Email
- Current Glicko2 rating
- Win / Loss / Draw counts
- Credits balance and current level (from the progression system)
- **"Log out"** button — clears `localStorage` token and resets `authUser`/`authToken` to null
- **"Delete account"** button (danger zone, requires a second confirmation modal) — calls `DELETE /api/users/:id`, then logs out and clears all local state

All API calls go to the backend at `/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `PATCH /api/users/username`, and `DELETE /api/users/:id`.

### Auth State Variables

| Variable | Type | Description |
|---|---|---|
| `authToken` | `string \| null` | JWT access token; persisted in `localStorage` under key `checkers_token` |
| `authUser` | `object \| null` | Full user object from `/api/auth/me` (includes rating, W/L/D) |
| `myUserId` | `string \| null` | Shorthand for `authUser.id`; threaded through room events |

### `initAuth()`

Called once on page load. Reads `localStorage` for a stored token, calls `GET /api/auth/me` to validate it, and populates `authUser` and `myUserId` if valid. If the token is missing or the server returns 401, auth state is cleared silently.

---

## Leaderboard Panel (Fork A)

A panel displayed below the Mode Bar (always visible, all game modes). Shows the **top 10 players** ranked by Glicko2 rating.

- Fetched from `GET /api/users/leaderboard?limit=10` on page load and after each online game concludes.
- Each row: rank number, username, rating value.
- The logged-in user's row is highlighted.
- If the backend is unreachable the panel renders a silent "—" placeholder row rather than an error.

---

## Hamburger Menu

Fixed position, top-right corner. Opens a tree menu with five collapsible sections. The arrow beside each section header rotates 90° when that subtree is expanded.

**The menu only closes via the X button.** Clicking outside or selecting an option does not close it — this prevents accidental dismissal.

**Section order:** Language → Rules → Game Type → Difficulty → Style

### Section 1 — Language

Two options: **EN** and **RU**.

Switching calls `setLanguage(l)` which sets the module-level `lang` variable and then calls `applyLang()`. `applyLang()` walks the `TR` object (described below) and updates every translatable element by ID.

### Section 2 — Rules

Three options:

- **Russian 8×8** — flying kings, mandatory captures, backward capture for pawns
- **English 8×8** — simple kings (1 step), forward-only movement and capture for pawns
- **International 10×10** — flying kings, mandatory captures, 10×10 board

Switching rules triggers `confirmAction()` if a game is live, then rebuilds the board.

### Section 3 — Game Type

Three options matching the Mode Bar buttons: **vs Computer**, **2 Players**, **Online**.

Selecting here (or clicking Mode Bar buttons) calls `setModeFromMenu(m)`, which calls `confirmAction()` if a game is live, then calls `setMode(m)`.

### Create Room form

Expandable inline form under the "+ New Room" button (visible in Online mode lobby). Fields:
- **Room code** — optional password (leave blank for open room)
- **Turn timer** — pill buttons: **Off** (default) / **30 s** / **60 s**. Selection stored in `onlineTimerSel`, passed as `turnTime` in `room:create`.

### Section 4 — Difficulty

Three options: **Easy**, **Medium**, **Hard**.

Only active when Game Type is **vs Computer**. In all other modes the section is visually greyed out (`diff-frozen` class: `opacity: 0.38; pointer-events: none`).

Switching difficulty calls `confirmAction()` if a game is live, then resets the board.

### Section 5 — Style

Four sub-controls:

1. **Dark pieces** — 5 color presets: Indigo, Crimson, Forest, Amber, Slate. Each preset writes new values into `--dp-hi`, `--dp-mid`, `--dp-lo`.
2. **Light pieces** — 5 color presets: Ivory, Rose, Sky, Mint, Gold. Each preset writes new values into `--lp-hi`, `--lp-mid`, `--lp-lo`.
3. **Board size slider** — adjusts `--board-sz` from a minimum (~320px) to maximum (~520px).
4. **Piece size slider** — labeled "small → large" but rendered reversed so dragging right makes pieces smaller (more inset). Adjusts `--piece-inset`.

---

## Mode Bar

Three buttons pinned at the top of the play area:

```
⚙ vs Computer  |  👥 2 Players  |  🌐 Online
```

Clicking any button calls `setMode(m)`, which:

- Sets the module-level `gameMode` variable
- Shows or hides the Online panel
- Freezes or unfreezes the Difficulty section in the hamburger menu (greyed when not in AI mode)
- Resets the board if needed

The active button receives a highlighted style.

---

## Board Rendering

The board is a **CSS Grid** — 8 columns × 8 rows for Russian/English rules, 10 × 10 for International.

| Element | Rendering |
|---|---|
| Dark cells | `--cell-dark` background |
| Light cells | `--cell-light` background |
| Selected piece | Purple cell highlight behind the piece |
| Valid move targets | Small green dot overlay centered in cell |
| Capture targets | Small red dot overlay centered in cell |

**Coordinate labels** (A–H or A–J along columns, 1–8 or 1–10 along rows) are rendered as flex items around the board frame.

**Board flip for online Black player:** when the local player is Black in an online game, the board element receives `transform: rotate(180deg)` and each piece receives a counter-rotation so the crown symbols stay upright.

---

## Pieces

### Rendering

Pieces are absolutely-positioned `div` elements inside their cell. Shape is controlled by `border-radius: 50%`.

- **Light pieces:** `radial-gradient` using `--lp-hi`, `--lp-mid`, `--lp-lo`
- **Dark pieces:** `radial-gradient` using `--dp-hi`, `--dp-mid`, `--dp-lo`

Piece animations use three keyframe sets: `pieceGlow` (shadow pulse), `borderColor` (border hue shift), and `pulseGlow` (scale throb). These run continuously on all pieces to give the board a living feel.

### Presets

| Side | Presets |
|---|---|
| Light | Ivory, Rose, Sky, Mint, Gold |
| Dark | Indigo, Crimson, Forest, Amber, Slate |

### Kings

Kings display a Unicode crown: **♔** for light kings, **♚** for dark kings. The symbol is centered over the piece using flexbox.

### Selected piece

Receives `transform: scale(1.1) translateY(-4px)` — lifts and enlarges slightly to indicate selection.

---

## Online Panel UI

The online panel sits below the mode bar and is only visible in Online mode. It has three named views toggled by `opShowView(view)`:

### `lobby` view

- Name input field (player display name)
- **+ New Room** button — expands an inline create form
  - Optional room code field (leave empty for open room)
  - Confirm / Cancel buttons
- Room list — refreshes automatically every 4 seconds

Each room list row shows:
- Lock icon (if a code was set on room creation)
- Host player name
- Rules tag: `RU 8×8`, `EN 8×8`, or `INT 10×10`
- Status dot: gold = waiting for opponent, red = game in progress
- **Join** button

Clicking Join on a locked room reveals an inline code input; the user must enter the correct code before joining.

### `waiting` view

Shown after creating a room. Displays:
- The room ID (for sharing)
- Copy-to-clipboard button
- "Waiting for opponent…" status text

### `playing` view

Shown once an opponent has joined. Displays:
- Connection status dot + opponent's display name
- **Turn timer bar** (only shown when `turnTime > 0`): countdown label + color-fill progress bar. Bar turns red and pulses when ≤ 10 seconds remain.
- **Reconnect notice** (only shown when opponent's socket drops): gold banner with remaining grace-window seconds.
- **Leave** button — if a game is in progress, the opponent is immediately declared the winner.

---

## Online Rating Recording (Fork A)

After every online game that has an authenticated participant, the client calls:

```js
recordOnlineResult(opponentId, result, rulesType, roomId)
```

This function POSTs to `POST /api/games/guest-result` with the JWT from `authToken`. It is triggered in three places:

| Trigger | Result recorded |
|---|---|
| `game:result` socket event received (normal win/loss) | win or loss depending on `winnerId === myUserId` |
| `room:opponent-left-win` received | win (always — opponent forfeited) |
| `showWin()` detects local win, emits `game:over` | handled via the relay's `game:result` response |

If the player is not authenticated (`authToken === null`) or the opponent's ID is unknown, the function returns immediately without making a network call.

---

## Translation System

All user-facing strings are stored in the `TR` object with `en` and `ru` sub-objects keyed by element ID:

```js
TR = {
  en: { statusTurn: "Your turn", btnNewGame: "New Game", ... },
  ru: { statusTurn: "Ваш ход",   btnNewGame: "Новая игра", ... }
}
```

`applyLang()` iterates over the keys of `TR[lang]` and sets `document.getElementById(key).textContent` for each. `setLanguage(l)` sets `lang = l` then calls `applyLang()`.

Translatable content covers: game status messages, all button labels, difficulty option names, player name defaults ("Black" / "White"), overlay text (win/draw/resign messages).

---

## History & Score Panels

Two side panels flank the board on desktop (hidden on `max-width: 780px`):

**Left panel (Black player):**
- Avatar icon
- Score (games won this session)
- Captured pieces display (small piece icons, one per capture)
- Turn indicator (glows when it is Black's turn)

**Right panel (White player):**
- Avatar icon
- Score
- Captured pieces display
- Move history — last 20 half-moves in algebraic notation (e.g. `d6-e5`, `c3×e5`)

Move history scrolls; newest entry is at the bottom.

---

## Exit Confirmation

Whenever an action would discard an in-progress game, a modal dialog asks **"Exit game? — The current game will be lost."** with **Yes, exit** / **Cancel** buttons.

The gate is `gameIsLive()` → returns `true` when `history.length > 0 && !gameOver`.

Actions guarded by `confirmAction()`:
- **New Game button** — all modes except online (online uses leave-wins instead)
- **Rules change** (via hamburger menu)
- **Game Type / Mode change** (via hamburger menu or Mode Bar buttons)
- **Difficulty change** (via hamburger menu)

Online "Leave game" button triggers the server-side leave-wins flow, not this dialog.

The confirm dialog is fully translated (`confirmExit`, `confirmSub`, `confirmYes`, `confirmNo` keys in `TR`).

---

## Game Rules Panel

A collapsible panel below the board, always visible regardless of game mode.

- **Toggle**: clicking the header row expands/collapses the body. Arrow rotates 90° when open.
- **Content**: full plain-language description of the currently selected ruleset, in the active language (EN/RU).
- **Auto-updates**: re-renders whenever rules change (`setRules`) or language switches (`applyLang` → `renderRulesBody`).

Rules text is stored in the `RULES_TEXT` object keyed by `[ruleset][lang]`, each containing a `title` string and an array of `{h, t}` section objects (heading + paragraph). Paragraphs support inline HTML (`<strong>` for key terms).

Rulesets covered: `russian`, `english`, `international` — each with `en` and `ru` translations.
