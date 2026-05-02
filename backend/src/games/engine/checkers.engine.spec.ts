import {
  createInitialBoard,
  getAvailableMoves,
  applyMove,
  isGameOver,
  evaluatePosition,
  getBestMove,
  type BoardState,
  type MoveResult,
  type PieceColor
} from './checkers.engine';

describe('Checkers Engine', () => {
  describe('createInitialBoard', () => {
    it('should create a valid 8x8 board for Russian rules', () => {
      const state = createInitialBoard('russian');
      expect(state.boardSize).toBe(8);
      expect(state.currentTurn).toBe('white');
      expect(state.rulesType).toBe('russian');

      // Check that pieces are placed correctly
      // White pieces on bottom 3 rows
      for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2 === 1) {
            expect(state.board[r][c]?.color).toBe('white');
            expect(state.board[r][c]?.type).toBe('man');
          } else {
            expect(state.board[r][c]).toBeNull();
          }
        }
      }

      // Black pieces on top 3 rows
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2 === 1) {
            expect(state.board[r][c]?.color).toBe('black');
            expect(state.board[r][c]?.type).toBe('man');
          } else {
            expect(state.board[r][c]).toBeNull();
          }
        }
      }

      // Middle rows should be empty
      for (let r = 3; r < 5; r++) {
        for (let c = 0; c < 8; c++) {
          expect(state.board[r][c]).toBeNull();
        }
      }
    });

    it('should create a valid 10x10 board for international rules', () => {
      const state = createInitialBoard('international');
      expect(state.boardSize).toBe(10);
      expect(state.rulesType).toBe('international');
    });
  });

  describe('getAvailableMoves', () => {
    it('should return valid moves for white pieces at the start', () => {
      const state = createInitialBoard('russian');
      const moves = getAvailableMoves(state, 'white');

      expect(moves.length).toBeGreaterThan(0);
      expect(moves.every(move => move.captures.length === 0)).toBe(true);

      // All moves should be forward (decreasing row numbers for white)
      moves.forEach(move => {
        expect(move.to.row).toBeLessThan(move.from.row);
        expect(Math.abs(move.to.col - move.from.col)).toBe(1);
      });
    });

    it('should prioritize captures over regular moves', () => {
      // Create a board where white can capture
      const state: BoardState = {
        board: [
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, {color: 'black', type: 'man'}, null, null, null, null, null],
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const moves = getAvailableMoves(state, 'white');
      expect(moves.length).toBe(1);
      expect(moves[0].captures.length).toBe(1);
      expect(moves[0].from).toEqual({row: 4, col: 1});
      expect(moves[0].to).toEqual({row: 2, col: 3});
    });
  });

  describe('applyMove', () => {
    it('should correctly apply a regular move', () => {
      const state = createInitialBoard('russian');
      const moves = getAvailableMoves(state, 'white');
      const move = moves[0];

      const newState = applyMove(state, move);

      expect(newState.board[move.from.row][move.from.col]).toBeNull();
      expect(newState.board[move.to.row][move.to.col]?.color).toBe('white');
      expect(newState.board[move.to.row][move.to.col]?.type).toBe('man');
      expect(newState.currentTurn).toBe('black');
      expect(newState.moveCount).toBe(1);
    });

    it('should correctly apply a capture move', () => {
      const state: BoardState = {
        board: [
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, {color: 'black', type: 'man'}, null, null, null, null, null],
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const moves = getAvailableMoves(state, 'white');
      const captureMove = moves.find(m => m.captures.length > 0)!;

      const newState = applyMove(state, captureMove);

      expect(newState.board[captureMove.from.row][captureMove.from.col]).toBeNull();
      expect(newState.board[captureMove.captures[0].row][captureMove.captures[0].col]).toBeNull();
      expect(newState.board[captureMove.to.row][captureMove.to.col]?.color).toBe('white');
      expect(newState.currentTurn).toBe('black');
    });

    it('should promote a man to dama when reaching the opposite end', () => {
      const state: BoardState = {
        board: [
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const moves = getAvailableMoves(state, 'white');
      const move = moves[0]; // Should be moving to row 0

      const newState = applyMove(state, move);

      expect(newState.board[move.to.row][move.to.col]?.type).toBe('dama');
      expect(move.promotion).toBe(true);
    });
  });

  describe('isGameOver', () => {
    it('should detect when a player has no moves', () => {
      const state: BoardState = {
        board: [
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const result = isGameOver(state);
      expect(result.over).toBe(true);
      expect(result.winner).toBe('black');
    });

    it('should not be game over at the start', () => {
      const state = createInitialBoard('russian');
      const result = isGameOver(state);
      expect(result.over).toBe(false);
      expect(result.winner).toBeNull();
    });
  });

  describe('evaluatePosition', () => {
    it('should give higher score to white when white has more pieces', () => {
      const state: BoardState = {
        board: [
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const score = evaluatePosition(state);
      expect(score).toBeGreaterThan(0);
    });

    it('should give higher score to black when black has more pieces', () => {
      const state: BoardState = {
        board: [
          [null, {color: 'black', type: 'man'}, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const score = evaluatePosition(state);
      expect(score).toBeLessThan(0);
    });
  });

  describe('getBestMove', () => {
    it('should return a valid move when moves are available', () => {
      const state = createInitialBoard('russian');
      const bestMove = getBestMove(state);

      expect(bestMove).not.toBeNull();
      expect(bestMove!.from).toBeDefined();
      expect(bestMove!.to).toBeDefined();
      expect(bestMove!.captures).toBeDefined();
    });

    it('should return null when no moves are available', () => {
      const state: BoardState = {
        board: [
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          [null, {color: 'white', type: 'man'}, null, null, null, null, null, null],
        ],
        currentTurn: 'white',
        rulesType: 'russian',
        boardSize: 8,
        moveCount: 0,
        captureCount: 0
      };

      const bestMove = getBestMove(state);
      expect(bestMove).toBeNull();
    });
  });
});