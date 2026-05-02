'use client';
import { useState, useCallback } from 'react';
import { BoardState, Piece, Position, PieceColor } from '../../types/game';
import { clsx } from 'clsx';

interface Props {
  boardState: BoardState;
  playerColor: PieceColor;
  onMove: (from: string, to: string) => void;
  disabled?: boolean;
}

function cellToNotation(row: number, col: number): string {
  return `${String.fromCharCode(97 + col)}${row + 1}`;
}

function getLegalMovesForPiece(boardState: BoardState, row: number, col: number): Position[] {
  // Simplified: highlight squares that could be targets (server validates actual legality)
  const piece = boardState.board[row][col];
  if (!piece) return [];
  const targets: Position[] = [];
  const dirs = piece.type === 'dama' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
    piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  const size = boardState.boardSize;

  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !boardState.board[nr][nc])
      targets.push({ row: nr, col: nc });
    const cr = row + dr, cc = col + dc, lr = row + dr*2, lc = col + dc*2;
    if (lr >= 0 && lr < size && lc >= 0 && lc < size &&
        boardState.board[cr]?.[cc]?.color !== piece.color && boardState.board[cr]?.[cc] &&
        !boardState.board[lr][lc])
      targets.push({ row: lr, col: lc });
  }
  return targets;
}

export default function CheckersBoard({ boardState, playerColor, onMove, disabled }: Props) {
  const [selected, setSelected] = useState<Position | null>(null);
  const [highlights, setHighlights] = useState<Position[]>([]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (disabled || boardState.currentTurn !== playerColor) return;
    const piece = boardState.board[row][col];

    if (piece && piece.color === playerColor) {
      setSelected({ row, col });
      setHighlights(getLegalMovesForPiece(boardState, row, col));
      return;
    }

    if (selected && highlights.some(h => h.row === row && h.col === col)) {
      onMove(cellToNotation(selected.row, selected.col), cellToNotation(row, col));
      setSelected(null);
      setHighlights([]);
      return;
    }

    setSelected(null);
    setHighlights([]);
  }, [boardState, playerColor, selected, highlights, onMove, disabled]);

  const size = boardState.boardSize;
  const rows = playerColor === 'white' ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
  const cols = playerColor === 'white' ? Array.from({ length: size }, (_, i) => i) : Array.from({ length: size }, (_, i) => size - 1 - i);

  return (
    <div className="inline-block border-2 border-gray-700 shadow-2xl" style={{ width: size * 64, height: size * 64 }}>
      {rows.map(row => (
        <div key={row} className="flex">
          {cols.map(col => {
            const isLight = (row + col) % 2 === 0;
            const piece = boardState.board[row][col];
            const isSelected = selected?.row === row && selected?.col === col;
            const isHighlighted = highlights.some(h => h.row === row && h.col === col);

            return (
              <div
                key={col}
                className={clsx('w-16 h-16 flex items-center justify-center cursor-pointer relative',
                  isLight ? 'bg-amber-100' : 'bg-amber-800',
                  isSelected && 'ring-4 ring-yellow-400 ring-inset',
                  isHighlighted && !isLight && 'bg-amber-600',
                )}
                onClick={() => handleCellClick(row, col)}
              >
                {isHighlighted && !piece && (
                  <div className="w-4 h-4 rounded-full bg-yellow-400 opacity-60" />
                )}
                {piece && (
                  <div className={clsx(
                    'w-12 h-12 rounded-full border-4 flex items-center justify-center text-xl font-bold shadow-lg transition-transform hover:scale-105',
                    piece.color === 'white'
                      ? 'bg-gray-100 border-gray-300 text-gray-800'
                      : 'bg-gray-900 border-gray-700 text-gray-200',
                  )}>
                    {piece.type === 'dama' ? '♛' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
