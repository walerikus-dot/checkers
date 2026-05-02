# Game Engine & Rules

## Board Representation

The board is modeled as a 2D array `board[row][col]`. Each cell holds one of five constants:

| Constant  | Value | Meaning          |
|-----------|-------|------------------|
| EMPTY     | 0     | No piece         |
| WHITE     | 1     | White pawn       |
| BLACK     | 2     | Black pawn       |
| WHITE_K   | 3     | White king       |
| BLACK_K   | 4     | Black king       |

The board size is controlled by the `SIZE` variable:
- `SIZE = 8` for Russian and English rulesets
- `SIZE = 10` for International

Only dark squares are used, identified by the condition `(row + col) % 2 === 1`. Light squares are always empty and never interacted with.

### Starting Positions

**8x8 boards (Russian / English):**
- Black pieces occupy rows 0–2
- White pieces occupy rows 5–7

**10x10 board (International):**
- Black pieces occupy rows 0–3 (20 pieces total)
- White pieces occupy rows 6–9 (20 pieces total)

---

## Three Rulesets

### Russian (8x8)

- **Flying kings:** A king may slide any number of squares diagonally in any direction, similar to a bishop in chess.
- **King captures:** A king slides diagonally toward an enemy piece, jumps over it, and may land on any empty square behind it along the same diagonal.
- **Backward capture:** All pieces — including pawns — may capture backward. There is no forward-only restriction on captures.
- **Mandatory capture:** If any capture is available for the current player, they must capture. Non-capture moves are illegal when a capture exists.
- **Promotion:** A pawn that reaches the opponent's back row is promoted to a king immediately. If promoted during a multi-capture, the chain ends (in Russian rules the piece does not continue capturing as a king in the same turn).

### English (8x8)

- **Non-flying kings:** Kings move exactly one square diagonally per turn, in any direction.
- **Forward-only movement and captures:** Pawns may only move and capture forward (toward the opponent's side). Backward moves and backward captures are not permitted for pawns.
- **Mandatory capture:** Same as Russian — capturing is forced if any capture is available.
- **Promotion:** Same trigger as Russian — reaching the opponent's back row promotes the pawn to a king.

### International (10x10)

- Follows the same rules as Russian checkers but played on a 10x10 board.
- Each side begins with 20 pieces arranged across 4 rows.
- Flying kings, backward captures, and mandatory capture all apply.

---

## Move Generation Functions

### `getCaptures(r, c, board)`

Returns an array of capture moves available for the piece at `(r, c)`. Each entry has the shape `{ to: [r, c], cap: [r, c] }`, where `to` is the landing square and `cap` is the captured piece's square.

For flying kings, the function loops diagonally in each of the four directions. When it finds an enemy piece along the diagonal, it collects all empty squares beyond that piece as valid landing positions.

### `getMoves(r, c, board)`

Returns an array of non-capture moves available for the piece at `(r, c)`. Respects the directional restrictions of the active ruleset (e.g., English pawns cannot move backward).

### `allCaptures(color, board)`

Iterates over every piece of the given color on the board and aggregates all captures returned by `getCaptures`. Returns a flat list of all capture moves available to that side.

### `allMoves(color, board)`

The authoritative move-selection function used during play. Behavior depends on the mandatory capture rule:
- If `allCaptures` returns any moves, returns only those captures (mandatory capture enforced).
- Otherwise, returns all non-capture moves from every piece of that color.

### `applyMove(fr, fc, tr, tc, capCell, board)`

Applies a single move to the board and returns `{ nb, captured }` where `nb` is the new board state and `captured` is a boolean indicating whether an enemy piece was removed.

Handles:
- Moving the piece from `(fr, fc)` to `(tr, tc)`
- Removing the captured piece at `capCell` (if any)
- King promotion: if a pawn reaches the opponent's back row after the move, it is upgraded to the corresponding king constant.

---

## AI: Minimax with Alpha-Beta Pruning

### Evaluation Function — `evaluate(board)`

Scores the board from the perspective of the maximizing player. The evaluation sums:
- **Piece value:** 1 point for each pawn, 3 points for each king
- **Positional bonus:** A small bonus for advancement — pawns closer to the opponent's back row score higher, rewarding forward progress

Enemy pieces contribute negatively to the score.

### Search — `minimax(board, depth, alpha, beta, maximizing)`

A standard recursive minimax implementation with alpha-beta pruning. At each node:
- Generates all legal moves for the current side
- Applies each move, recurses to the next depth level
- Prunes branches that cannot improve on already-found results
- Returns the best score found within the search tree

### Multi-Capture Chain Builder — `buildCaptureChain(r, c, board, chain)`

Recursively builds complete multi-capture sequences for a given piece. Used by the AI to evaluate and execute full capture chains rather than individual jumps. The function accumulates each leg of the chain into the `chain` array, exploring all possible continuations after each capture.

### `aiMove()`

The top-level AI function. It:
1. Generates all legal moves (or full capture chains) for the AI's color
2. Scores each option using `minimax`
3. Selects the best-scoring move, subject to the configured difficulty randomness
4. Executes the chosen move (or chain) with animation delays between steps

### Difficulty Settings

| Difficulty | Search Depth | Randomness                                      |
|------------|-------------|------------------------------------------------|
| Easy       | 1           | 70% chance of choosing a random legal move; additionally, 40% chance of picking a completely random move (ignoring evaluation entirely) |
| Medium     | 3           | 15% chance of choosing a random move instead of the best move |
| Hard       | 5           | 0% — always plays the optimal move             |

---

## Multi-Capture

After a piece completes a capture, the engine checks whether the same piece has additional captures available from its new position:
- If further captures exist, `multiCapture` is set to `[tr, tc]`, locking that piece as the only movable piece.
- The player must continue capturing with that piece; no other moves are permitted until the chain is exhausted.
- The chain ends when the capturing piece has no further captures from its current position (or when promotion occurs under Russian rules).

The AI builds full capture chains upfront using `buildCaptureChain` and executes them step by step with animation delays, so the sequence plays out visually move by move.

---

## Win Detection

`checkWin()` is called after every move (including each step of a multi-capture chain). A player wins if either of the following is true for the opponent:
- The opponent has **zero pieces** remaining on the board.
- The opponent has **no legal moves** available (all pieces are blocked).

When a win is detected, an overlay is displayed showing a win or loss message for the human player.
