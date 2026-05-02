# REST API & WebSocket Events

## REST API

All REST endpoints are served under the base path `/api`.

---

### Authentication Endpoints

#### `POST /api/auth/register`

Creates a new user account.

**Request body:**
```json
{ "username": "string", "email": "string", "password": "string" }
```

**Response:**
```json
{ "user": { ... }, "accessToken": "string", "refreshToken": "string" }
```

---

#### `POST /api/auth/login`

Authenticates an existing user.

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Response:** Access token and refresh token pair.

---

#### `GET /api/auth/me`

Returns the full profile of the currently authenticated user.

**Headers:** `Authorization: Bearer <accessToken>`

**Response:**
```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "avatarUrl": "string|null",
  "country": "string|null",
  "countryCode": "string|null",
  "phone": "string|null",
  "pendingEmail": "string|null",
  "rating": { "rating": 1500, "rd": 350, "gamesPlayed": 0, "wins": 0, "losses": 0, "draws": 0 },
  "progress": { "xp": 0, "credits": 0, "streak": 0, "totalWins": 0, "totalGames": 0, "firstWinBonus": false }
}
```

Returns `401 Unauthorized` if no valid token is supplied.

---

#### `POST /api/auth/logout`

Invalidates the current refresh token.

---

#### `POST /api/auth/refresh`

Exchanges a refresh token for a new access token. The refresh token is read from the `refreshToken` HttpOnly cookie set on login.

**Response:**
```json
{ "accessToken": "string", "user": { ... } }
```

---

#### `POST /api/auth/forgot-password`

Sends a password-reset email containing a link with `#reset_token=…`. Always returns `{ ok:true }` (no email enumeration).

**Request body:** `{ "email": "string" }`

---

#### `POST /api/auth/reset-password`

Consumes a token from the reset link and sets a new password.

**Request body:** `{ "token": "string", "password": "8+ chars" }`

---

#### `POST /api/auth/change-password` _(Authenticated)_

Changes the password using the current password as proof. Used by the **Profile → Edit → Change password** panel.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body:**
```json
{ "currentPassword": "string", "newPassword": "8+ chars" }
```

**Errors:**
- `400` — current password incorrect, new password too short, or no password set on the account (OAuth-only)
- `400` — new password equal to current

**Response:** `{ "ok": true, "message": "Password changed successfully." }`

---

#### `POST /api/auth/request-email-change` _(Authenticated)_

Initiates an email change. Verifies the user's current password, stores the new address as `pendingEmail`, generates a 24-hour token, and emails a confirmation link to the **new** address.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body:**
```json
{ "newEmail": "string", "currentPassword": "string" }
```

**Errors:** `400` — invalid email, password incorrect, email already taken, or new email equals current.

**Response:** `{ "ok": true, "message": "Confirmation link sent to <newEmail>. Open it to finalize the change." }`

---

#### `POST /api/auth/confirm-email-change`

Finalizes a pending email change. The link in the confirmation email is `…#confirm_email=<token>` and the client posts the token to this endpoint.

**Request body:** `{ "token": "string" }`

**Errors:** `400` — invalid, expired, or already-applied token; or the new address became taken in the interim.

**Response:** `{ "ok": true, "message": "Email updated." }`

---

#### `GET /api/auth/google`

Redirects the client to Google's OAuth consent screen to begin the OAuth 2.0 flow.

---

#### `GET /api/auth/google/callback`

OAuth callback endpoint. Google redirects here after the user approves access. Completes authentication and issues tokens.

---

#### `POST /api/auth/google/token`

Verifies a Google ID token (issued by GIS / one-tap) and returns app tokens. Used by mobile/PWA clients.

**Request body:** `{ "credential": "<id_token>" }`

---

### Games Endpoints

All game endpoints require a valid JWT in the `Authorization` header.

#### `POST /api/games/private`

Creates a new private game.

**Request body:**
```json
{ "rulesType": "russian|english|international", "opponentId": "string (optional)" }
```

**Response:**
```json
{ "gameId": "string" }
```

---

#### `GET /api/games/:id`

Returns the full current state of a game, including the board layout.

---

#### `GET /api/games/:id/moves`

Returns the complete move history for a game as an array.

---

#### `POST /api/games/:id/move`

Submits a move for the authenticated player.

**Request body:**
```json
{ "from": "e3", "to": "d4" }
```

**Response:** Updated game state reflecting the move.

---

#### `DELETE /api/games/:id`

Resigns from the specified game. The opponent is declared the winner.

---

#### `POST /api/games/guest-result`

Records the outcome of a game played through the anonymous guest relay for a logged-in user. Both players must be registered and logged in for ratings to be updated.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body:**
```json
{
  "opponentId": "string",
  "result": "win | loss | draw",
  "rulesType": "russian | english | international",
  "roomId": "string"
}
```

**Response:** `201 Created` with the updated rating record on success.

This endpoint is called automatically by the HTML client at the end of each online game when the local player is authenticated.

---

#### `GET /api/games/history`

Returns a paginated list of past games for the currently authenticated user.

---

### Users Endpoints

#### `GET /api/users/leaderboard`

Returns the top N users ranked by Glicko2 rating.

**Query params:** `limit` (optional, default 50) — e.g. `?limit=10`

**Response:** array of `{ id, username, rating, wins, losses, draws }` sorted descending by rating.

---

#### `GET /api/users/:id`

Returns the public profile of the specified user.

---

#### `PUT /api/users/:id` _(Authenticated; can only update self)_

Partial update of the authenticated user's profile. Any subset of these fields may be sent — only fields present in the body are touched.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body (all fields optional):**
```json
{
  "username":    "string",        // 3–50 chars
  "avatarUrl":   "string",
  "country":     "string|null",   // free-text country name (e.g. "Greece"); null clears it
  "countryCode": "string|null",   // ISO 3166-1 alpha-2 (uppercased server-side); null clears it
  "phone":       "string|null"    // up to 32 chars; null clears it
}
```

**Notes:**
- **Email cannot be changed via this endpoint.** Use `POST /api/auth/request-email-change` (re-confirm via email link).
- `country` is set in three ways by the client: (1) explicit edit, (2) one-time geo-IP detection on first profile open, (3) returned by `/auth/me` on subsequent loads.
- Passing `403 Forbidden` if `:id` is not the caller's own user id.

**Response:** the full updated user object.

---

#### `PATCH /api/users/username`

Updates the username of the currently authenticated user.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body:**
```json
{ "username": "string" }
```

**Response:** Updated user object.

---

#### `DELETE /api/users/:id`

Permanently deletes the authenticated user's account and all associated data (ratings, game records, friend links).

**Headers:** `Authorization: Bearer <accessToken>`

**Response:** `200 OK` on success. Returns `403 Forbidden` if `:id` does not match the authenticated user.

---

### Ratings Endpoints

#### `GET /api/ratings/leaderboard`

Returns a Glicko-2 ranked list of players. Includes rating, rating deviation, and volatility where applicable.

---

### Tournaments Endpoints

All `GET` tournament endpoints are **public** (no auth required). `POST /join` and `DELETE /join` require JWT. Admin actions require `X-Admin-Key` header.

#### `GET /api/tournaments`

Returns a list of all tournaments with their current status. Sorted newest first.

**Response:** array of `{ id, name, format, rulesType, status, maxPlayers, participantCount, startsAt, createdBy, autoStarted }`

---

#### `GET /api/tournaments/:id`

Full tournament detail including participants.

---

#### `GET /api/tournaments/:id/bracket`

Returns the bracket for a started tournament.

**Response (Single Elimination):**
```json
{
  "tournamentId": "...",
  "format": "single_elimination",
  "rounds": [
    {
      "round": 1, "label": "Quarter-final",
      "matches": [{ "id": "...", "player1": {...}, "player2": {...}, "winner": null, "status": "ready" }]
    }
  ]
}
```

**Response (Round Robin):** Same structure plus a `standings` array:
```json
"standings": [{ "user": {...}, "wins": 2, "draws": 0, "losses": 1, "points": 6 }]
```

---

#### `GET /api/tournaments/:id/participants`

Returns the list of registered participants with their user profiles and seeds.

---

#### `POST /api/tournaments`

Creates a new tournament. Requires JWT.

**Request body:**
```json
{ "name": "string", "format": "single_elimination|round_robin", "rulesType": "russian|english|international", "maxPlayers": 8, "startsAt": "ISO date (optional)" }
```

---

#### `POST /api/tournaments/admin-create` _(Admin)_

Creates a tournament without a JWT — used by the admin panel. Requires `X-Admin-Key`. Same body shape as `POST /api/tournaments`; `createdBy` is left null.

---

#### `POST /api/tournaments/:id/join`

Join a pending tournament. Requires JWT. Returns `409` if already joined, `400` if full or not pending.

---

#### `DELETE /api/tournaments/:id/join`

Leave a pending tournament. Requires JWT. Returns `400` if tournament is already active.

---

#### `POST /api/tournaments/:id/start` _(Admin)_

Start a tournament and generate the bracket. Requires `X-Admin-Key` header. Needs ≥ 2 participants.

---

#### `POST /api/tournaments/:id/cancel` _(Admin)_

Cancel a pending or active tournament. Requires `X-Admin-Key`.

---

#### `POST /api/tournaments/:id/matches/:matchId/result` _(Admin)_

Report the result of a match. Requires `X-Admin-Key`.

**Request body:** `{ "winnerId": "userId or null (for draw)" }`

For Single Elimination: advances the winner to the next round automatically.

---

#### `GET /api/tournaments/schedules/list` _(Admin)_

List all auto-schedule configurations. Requires `X-Admin-Key`.

---

#### `POST /api/tournaments/schedules` _(Admin)_

Create a new auto-schedule. Requires `X-Admin-Key`.

**Request body:**
```json
{
  "name": "Daily Russian 8p",
  "format": "single_elimination",
  "rulesType": "russian",
  "maxPlayers": 8,
  "cronExpression": "0 18 * * *",
  "registrationHours": 2,
  "enabled": true
}
```

The scheduler fires the cron expression, creates a tournament with `startsAt = now + registrationHours`, and auto-starts it when `startsAt` is reached (if ≥ 2 players joined). Tournaments with < 2 players at start time are auto-cancelled.

---

#### `PATCH /api/tournaments/schedules/:id` _(Admin)_

Update an existing schedule (e.g. enable/disable, change cron). Requires `X-Admin-Key`.

---

#### `DELETE /api/tournaments/schedules/:id` _(Admin)_

Delete a schedule. Requires `X-Admin-Key`.

---

## WebSocket Events

### `/game` Namespace — Authenticated Players

This namespace is used for rated or private games between registered users. Connections must be authenticated.

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `game:join` | `{ gameId }` | Join an existing game room |
| `game:move` | `{ gameId, from, to }` | Submit a move using algebraic notation |
| `game:resign` | `{ gameId }` | Resign from the game |
| `chat:send` | `{ gameId, message }` | Send a chat message in the game room |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `game:state` | Full board object | Complete board state broadcast (e.g., on join or reconnect) |
| `game:move-validated` | `{ move, board }` | Confirmation that a move was accepted, with updated board |
| `game:game-ended` | `{ winner, reason }` | Signals end of game with winner and reason (resignation, no moves, etc.) |
| `chat:message` | `{ sender, text }` | Incoming chat message from the opponent |

---

### `/guest` Namespace — Unauthenticated Players

This namespace handles local multiplayer via rooms. No authentication is required.

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ name, rules, code?, turnTime?, userId? }` | Create a new room. `rules`: `'russian'`/`'english'`/`'international'`. `code` sets an optional password. `turnTime`: `30` or `60` (seconds per turn); omit or `undefined` for no timer. `userId` is the authenticated user's ID (optional — included when the client is logged in). |
| `room:list` | _(none)_ | Request the current list of available rooms |
| `room:join` | `{ roomId, name, code?, userId? }` | Join a room by ID. `code` required if the room is locked. `userId` included when logged in. |
| `room:rejoin` | `{ roomId, name }` | Re-attach to a room after a dropped connection (during the 30 s grace window). |
| `game:over` | `{ roomId, winner }` | Emitted by the winning client when a normal game conclusion is detected (e.g. no moves left). Triggers the relay to compute and emit `game:result` to both players. |
| `game:move` | `{ roomId, fr, fc, tr, tc, capCell }` | Send a move using grid coordinates. Relayed to the opponent. |
| `game:sync` | `{ roomId, board, turn, capturedByWhite, capturedByBlack }` | Host sends the full board state to the opponent (used after a reconnect). |
| `game:new` | `roomId` | Host-only. Signals both players to start a new game. |
| `room:leave` | `roomId` | Leave a room. If the game is in progress the opponent is declared the winner. |
| `game:draw-offer` | `{ roomId }` | Offer a draw. Relayed to opponent as `game:draw-offer`. |
| `game:draw-accept` | `{ roomId }` | Accept opponent's draw offer. Both clients end with draw. |
| `game:draw-decline` | `{ roomId }` | Decline opponent's draw offer. Game continues. |
| `game:chat` | `{ roomId, text }` | Send a chat message. Relayed to opponent. _(planned — not yet in gateway)_ |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room:list` | `[{ id, hostName, guestName?, rules, turnTime?, locked, status, createdAt }]` | Current snapshot of all available rooms. `turnTime` is present only when the host set a timer. |
| `room:created` | `{ roomId, color: 'white' }` | Sent to the host after creating a room. Host plays as white. |
| `room:joined` | `{ roomId, color: 'black', opponentName, opponentId?, rules, turnTime? }` | Sent to the guest after successfully joining. Guest plays as black. `opponentId` is the host's userId if they were logged in. |
| `room:opponent-joined` | `{ opponentName, opponentId?, color: 'white', rules, turnTime? }` | Sent to the host when a guest joins their room. `opponentId` is the guest's userId if they were logged in. |
| `room:reconnected` | `{ color, opponentName, rules, turnTime? }` | Sent to the reconnecting player — confirms their slot is restored. |
| `room:opponent-reconnected` | `{ opponentName }` | Sent to the waiting player when their opponent reconnects. |
| `room:opponent-reconnecting` | `{ timeout }` | Sent when the opponent's socket drops mid-game. `timeout` is seconds remaining in the grace window. |
| `room:opponent-left-win` | `{ opponentId, rules, roomId }` | Sent when the opponent explicitly leaves or the reconnect grace window expires. The receiver is the winner. Payload includes the opponent's userId and the room's ruleset so the client can call `/api/games/guest-result`. |
| `room:host-left` | _(none)_ | Sent to the guest when the host dissolves a waiting (pre-game) room. |
| `room:guest-left` | _(none)_ | Sent to the host when the guest leaves the lobby before a game starts. |
| `room:error` | `{ msg }` | Error message (e.g., wrong code, room full, room not found, stale rejoin token). |
| `game:move` | `{ fr, fc, tr, tc, capCell }` | Opponent's move relayed to the receiving player. |
| `game:sync` | `{ board, turn, capturedByWhite, capturedByBlack }` | Full board state delivered to the rejoining player so they are back in sync. |
| `game:new` | _(none)_ | Relayed to the guest when the host starts a new game. |
| `game:result` | `{ winnerId, loserId, rulesType, roomId }` | Emitted by the relay to both players after `game:over` is received. Contains the user IDs needed for both clients to call `/api/games/guest-result` independently. |
| `game:draw-offer` | _(none)_ | Relayed from opponent — show draw offer modal. |
| `game:draw-accept` | _(none)_ | Opponent accepted draw — end game as draw. |
| `game:draw-decline` | _(none)_ | Opponent declined draw — game continues. |
| `game:chat` | `{ text, from }` | Chat message from opponent. _(planned)_ |

---

## Room Lifecycle

The following sequence describes a complete guest-namespace room session from creation through reconnect handling:

1. **Host creates a room** — calls `room:create` with a display name, ruleset, optional password, and optional turn timer (`30` or `60` seconds). The server responds with `room:created`, assigning the host white pieces. The host enters the waiting view.

2. **Guest discovers the room** — calls `room:list`. Each room entry includes a `turnTime` field (if set) and a `locked` flag.

3. **Guest joins the room:**
   - Unlocked rooms: `room:join` directly.
   - Locked rooms: user enters the code in the inline input, then `room:join` with the `code` field.

4. **Both players are notified:**
   - Host receives `room:opponent-joined` (includes `turnTime`).
   - Guest receives `room:joined` (includes `turnTime`).

5. **Game initializes** — Both clients call `newGame()`. The turn timer, if configured, starts immediately. The host (white) moves first.

6. **Gameplay loop** — For each full turn change:
   - The moving player emits `game:move`.
   - The server relays the move to the opponent.
   - The receiving client calls `executeMove` locally.
   - The turn timer resets for the next player.

7. **Timer expiry** — If `onlineTurnTime > 0` and the countdown reaches zero, the client whose timer expired loses. The win overlay is shown locally; no server event is needed (both clients track the same timer).

8. **Player leaves** — `room:leave` is sent. If a game is in progress the server emits `room:opponent-left-win` to the other player. If still in the lobby/waiting state, the normal `room:host-left` / `room:guest-left` events are used instead.

9. **Disconnection & reconnect:**
   - When a socket drops mid-game the server holds the room in `reconnecting` state for **30 seconds** and notifies the remaining player via `room:opponent-reconnecting`.
   - If the disconnected client reconnects within the grace window it emits `room:rejoin`. The server restores the slot and emits `room:reconnected` to the rejoiner and `room:opponent-reconnected` to the other player.
   - The host then emits `game:sync` with the full board state so the rejoiner can catch up.
   - If the grace window expires without a rejoin, the remaining player receives `room:opponent-left-win`.

10. **Normal game end** — When the winning client detects a game conclusion (no moves remaining), it emits `game:over { roomId, winner }`. The relay computes the result and emits `game:result { winnerId, loserId, rulesType, roomId }` to both players. Each client independently POSTs to `/api/games/guest-result` if the player is logged in.

11. **Opponent leaves mid-game** — The relay emits `room:opponent-left-win { opponentId, rules, roomId }` to the remaining player, who is the winner. The client records the win via `/api/games/guest-result`.

12. **New game** — The host emits `game:new`. The server relays it to the guest; both sides reinitialize.
