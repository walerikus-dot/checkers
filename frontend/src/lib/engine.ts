export type PieceColor = 'white' | 'black';
export type PieceType = 'man' | 'dama';

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

export interface Position { row: number; col: number; }
export interface MoveResult { from: Position; to: Position; captures: Position[]; promotion: boolean; }

export interface BoardState {
  board: (Piece | null)[][];
  currentTurn: PieceColor;
  rulesType: 'russian' | 'international' | 'english';
  boardSize: number;
  moveCount: number;
  captureCount: number;
}

export function createInitialBoard(rulesType: 'russian' | 'international' | 'english' = 'russian'): BoardState {
  const size = rulesType === 'international' ? 10 : 8;
  const rows = rulesType === 'international' ? 4 : 3;
  const board: (Piece | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < size; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'black', type: 'man' };
    }
  }
  for (let r = size - rows; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'white', type: 'man' };
    }
  }
  return { board, currentTurn: 'white', rulesType, boardSize: size, moveCount: 0, captureCount: 0 };
}

export function getAvailableMoves(state: BoardState, color: PieceColor): MoveResult[] {
  const captures: MoveResult[] = [];
  const regular: MoveResult[] = [];

  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      const piece = state.board[r][c];
      if (!piece || piece.color !== color) continue;
      const pCaptures = getCaptures(state, { row: r, col: c }, []);
      const pMoves = getRegularMoves(state, { row: r, col: c });
      captures.push(...pCaptures);
      regular.push(...pMoves);
    }
  }

  if (captures.length > 0) {
    if (state.rulesType === 'international') {
      const maxCaptures = Math.max(...captures.map(m => m.captures.length));
      return captures.filter(m => m.captures.length === maxCaptures);
    }
    return captures;
  }
  return regular;
}

function getRegularMoves(state: BoardState, from: Position): MoveResult[] {
  const piece = state.board[from.row][from.col];
  if (!piece) return [];
  const dirs = getMoveDirections(piece, state.rulesType);
  const moves: MoveResult[] = [];

  if (piece.type === 'dama' && state.rulesType !== 'english') {
    for (const [dr, dc] of dirs) {
      let r = from.row + dr, c = from.col + dc;
      while (r >= 0 && r < state.boardSize && c >= 0 && c < state.boardSize && !state.board[r][c]) {
        moves.push({ from, to: { row: r, col: c }, captures: [], promotion: false });
        r += dr; c += dc;
      }
    }
  } else {
    for (const [dr, dc] of dirs) {
      const to = { row: from.row + dr, col: from.col + dc };
      if (to.row >= 0 && to.row < state.boardSize && to.col >= 0 && to.col < state.boardSize && !state.board[to.row][to.col]) {
        const promotion = isPromotion(piece, to, state.boardSize);
        moves.push({ from, to, captures: [], promotion });
      }
    }
  }
  return moves;
}

function getCaptures(state: BoardState, from: Position, alreadyCaptured: Position[]): MoveResult[] {
  const piece = state.board[from.row][from.col];
  if (!piece) return [];
  const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const results: MoveResult[] = [];

  if (piece.type === 'dama' && state.rulesType !== 'english') {
    for (const [dr, dc] of dirs) {
      let r = from.row + dr, c = from.col + dc;
      while (r >= 0 && r < state.boardSize && c >= 0 && c < state.boardSize) {
        const target = state.board[r][c];
        if (target && target.color !== piece.color && !alreadyCaptured.some(p => p.row === r && p.col === c)) {
          const captured = { row: r, col: c };
          let lr = r + dr, lc = c + dc;
          while (lr >= 0 && lr < state.boardSize && lc >= 0 && lc < state.boardSize && !state.board[lr][lc]) {
            const newCaptured = [...alreadyCaptured, captured];
            const clonedBoard = cloneBoard(state.board);
            clonedBoard[captured.row][captured.col] = null;
            const nextState = { ...state, board: clonedBoard };
            const continuation = getCaptures({ ...nextState, board: clonedBoard }, { row: lr, col: lc }, newCaptured);
            if (continuation.length > 0) {
              results.push(...continuation.map(m => ({ ...m, captures: [captured, ...m.captures] })));
            } else {
              results.push({ from: { row: from.row, col: from.col }, to: { row: lr, col: lc }, captures: newCaptured, promotion: isPromotion(piece, { row: lr, col: lc }, state.boardSize) });
            }
            lr += dr; lc += dc;
          }
          break;
        }
        if (target) break;
        r += dr; c += dc;
      }
    }
  } else {
    for (const [dr, dc] of dirs) {
      const capturePos = { row: from.row + dr, col: from.col + dc };
      const landPos = { row: from.row + dr * 2, col: from.col + dc * 2 };
      if (landPos.row < 0 || landPos.row >= state.boardSize || landPos.col < 0 || landPos.col >= state.boardSize) continue;
      const target = state.board[capturePos.row]?.[capturePos.col];
      if (!target || target.color === piece.color) continue;
      if (alreadyCaptured.some(p => p.row === capturePos.row && p.col === capturePos.col)) continue;
      if (state.board[landPos.row][landPos.col]) continue;
      const newCaptured = [...alreadyCaptured, capturePos];
      const clonedBoard = cloneBoard(state.board);
      clonedBoard[capturePos.row][capturePos.col] = null;
      const continuation = getCaptures({ ...state, board: clonedBoard }, landPos, newCaptured);
      if (continuation.length > 0) {
        results.push(...continuation.map(m => ({ ...m, captures: [capturePos, ...m.captures] })));
      } else {
        results.push({ from: { row: from.row, col: from.col }, to: landPos, captures: newCaptured, promotion: isPromotion(piece, landPos, state.boardSize) });
      }
    }
  }
  return results;
}

function getMoveDirections(piece: Piece, rulesType: string): number[][] {
  if (piece.type === 'dama') return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function isPromotion(piece: Piece, pos: Position, boardSize: number): boolean {
  if (piece.type === 'dama') return false;
  return piece.color === 'white' ? pos.row === 0 : pos.row === boardSize - 1;
}

function cloneBoard(board: (Piece | null)[][]): (Piece | null)[][] {
  return board.map(row => [...row]);
}

export function applyMove(state: BoardState, move: MoveResult): BoardState {
  const board = cloneBoard(state.board);
  const piece = board[move.from.row][move.from.col];
  board[move.from.row][move.from.col] = null;
  for (const cap of move.captures) board[cap.row][cap.col] = null;
  board[move.to.row][move.to.col] = move.promotion && piece ? { type: 'dama', color: piece.color } : piece;
  return {
    ...state,
    board,
    currentTurn: state.currentTurn === 'white' ? 'black' : 'white',
    moveCount: state.moveCount + 1,
    captureCount: move.captures.length > 0 ? 0 : state.captureCount + 1,
  };
}

export function isGameOver(state: BoardState): { over: boolean; winner: PieceColor | null } {
  const moves = getAvailableMoves(state, state.currentTurn);
  if (moves.length === 0) return { over: true, winner: state.currentTurn === 'white' ? 'black' : 'white' };
  const drawMoves = state.rulesType === 'international' ? 25 : 50;
  if (state.captureCount >= drawMoves) return { over: true, winner: null };
  return { over: false, winner: null };
}

export function evaluatePosition(state: BoardState): number {
  let score = 0;
  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const val = p.type === 'dama' ? 150 : 100;
      const centerBonus = Math.min(r, state.boardSize - 1 - r) + Math.min(c, state.boardSize - 1 - c);
      score += p.color === 'white' ? val + centerBonus : -(val + centerBonus);
    }
  }
  return score;
}

export function minimax(state: BoardState, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  const { over, winner } = isGameOver(state);
  if (over) return winner === 'white' ? 10000 : winner === 'black' ? -10000 : 0;
  if (depth === 0) return evaluatePosition(state);

  const color: PieceColor = maximizing ? 'white' : 'black';
  const moves = getAvailableMoves(state, color);

  if (maximizing) {
    let max = -Infinity;
    for (const move of moves) {
      const val = minimax(applyMove(state, move), depth - 1, alpha, beta, false);
      max = Math.max(max, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return max;
  } else {
    let min = Infinity;
    for (const move of moves) {
      const val = minimax(applyMove(state, move), depth - 1, alpha, beta, true);
      min = Math.min(min, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return min;
  }
}

export function getBestMove(state: BoardState, depth = 4): MoveResult | null {
  const moves = getAvailableMoves(state, state.currentTurn);
  if (moves.length === 0) return null;
  const maximizing = state.currentTurn === 'white';
  let bestMove = moves[0];
  let bestVal = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const val = minimax(applyMove(state, move), depth - 1, -Infinity, Infinity, !maximizing);
    if (maximizing ? val > bestVal : val < bestVal) { bestVal = val; bestMove = move; }
  }
  return bestMove;
}
