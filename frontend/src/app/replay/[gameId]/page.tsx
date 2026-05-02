'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { gamesApi } from '../../../lib/api';
import { createInitialBoard, applyMove, BoardState, MoveResult } from '../../../lib/engine';
import CheckersBoard from '../../../components/board/CheckersBoard';
import Link from 'next/link';

function cellToPos(cell: string) {
  return { col: cell.charCodeAt(0) - 97, row: parseInt(cell[1]) - 1 };
}

function buildSnapshots(rulesType: string, moves: any[]): BoardState[] {
  const states: BoardState[] = [createInitialBoard(rulesType as any)];
  for (const m of moves) {
    const prev = states[states.length - 1];
    const from = cellToPos(m.fromCell);
    const to   = cellToPos(m.toCell);
    const captures = (m.captures || []).map(cellToPos);
    const engineMove: MoveResult = { from, to, captures, promotion: m.isDamaPromotion };
    states.push(applyMove(prev, engineMove));
  }
  return states;
}

export default function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [step, setStep]       = useState(0);
  const [playing, setPlaying] = useState(false);

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => gamesApi.getGame(gameId).then(r => r.data),
    enabled: !!gameId,
  });

  const snapshots = game ? buildSnapshots(game.rulesType, game.moves || []) : [];
  const total = snapshots.length - 1;   // total moves (states - 1)

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (step >= total) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), 900);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  const prev = useCallback(() => { setPlaying(false); setStep(s => Math.max(0, s - 1)); }, []);
  const next = useCallback(() => { setPlaying(false); setStep(s => Math.min(total, s + 1)); }, [total]);
  const goTo = useCallback((n: number) => { setPlaying(false); setStep(n); }, []);

  if (isLoading) return <div className="flex justify-center py-20 text-gray-400 animate-pulse">Loading replay...</div>;
  if (!game)     return <div className="text-center py-20 text-gray-500">Game not found.</div>;

  const board   = snapshots[step];
  const move    = game.moves?.[step - 1];
  const white   = game.playerWhite?.username || 'White';
  const black   = game.playerBlack?.username || 'Black';
  const winner  = game.winner?.username;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/history" className="text-gray-500 hover:text-gray-300 text-sm transition">← History</Link>
        <h1 className="text-xl font-bold text-amber-400">
          {white} vs {black}
          {winner && <span className="ml-3 text-base font-normal text-gray-400">— {winner} won</span>}
        </h1>
        <span className="ml-auto text-xs text-gray-600 capitalize">{game.rulesType}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Board */}
        <div className="flex flex-col items-center gap-4">
          <div className="text-sm text-gray-400 self-start">
            {step === 0 ? 'Starting position' : `Move ${step} of ${total}`}
            {move && <span className="ml-2 text-gray-600">{move.fromCell}→{move.toCell}</span>}
          </div>

          {board && (
            <CheckersBoard
              boardState={board}
              playerColor="white"
              onMove={() => {}}
              disabled={true}
            />
          )}

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button onClick={() => goTo(0)} disabled={step === 0}
              className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-sm disabled:opacity-30 hover:bg-gray-700 transition">
              ⏮
            </button>
            <button onClick={prev} disabled={step === 0}
              className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-sm disabled:opacity-30 hover:bg-gray-700 transition">
              ◀
            </button>
            <button onClick={() => setPlaying(p => !p)}
              className="px-5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition">
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={next} disabled={step >= total}
              className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-sm disabled:opacity-30 hover:bg-gray-700 transition">
              ▶
            </button>
            <button onClick={() => goTo(total)} disabled={step >= total}
              className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-sm disabled:opacity-30 hover:bg-gray-700 transition">
              ⏭
            </button>
          </div>

          {/* Scrubber */}
          <input type="range" min={0} max={total} value={step}
            onChange={e => goTo(Number(e.target.value))}
            className="w-full accent-amber-500" />
        </div>

        {/* Move list */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-gray-400 mb-2">Moves</h2>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-400 w-10">#</th>
                  <th className="px-3 py-2 text-left text-gray-400">Move</th>
                  <th className="px-3 py-2 text-left text-gray-400">Captures</th>
                </tr>
              </thead>
              <tbody>
                {(game.moves || []).map((m: any, i: number) => (
                  <tr key={m.id || i}
                    onClick={() => goTo(i + 1)}
                    className={`border-t border-gray-700 cursor-pointer transition ${
                      step === i + 1 ? 'bg-amber-500/20 text-white' : 'hover:bg-gray-700/50 text-gray-300'
                    }`}>
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">{m.fromCell}→{m.toCell}{m.isDamaPromotion ? ' ♛' : ''}</td>
                    <td className="px-3 py-2 text-red-400 font-mono text-xs">
                      {m.captures?.length > 0 ? `×${m.captures.join(' ')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
