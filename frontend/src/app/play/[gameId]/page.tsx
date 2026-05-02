'use client';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import CheckersBoard from '../../../components/board/CheckersBoard';
import GameChat from '../../../components/game/GameChat';
import { useGameSocket } from '../../../hooks/useGameSocket';
import { useAuthStore } from '../../../store/auth.store';

function MoveTimer({ moveCount, active }: { moveCount: number; active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Reset on each new move
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [moveCount]);

  // Tick every second when game is active
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active, moveCount]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const isLong = elapsed >= 60;

  return (
    <span className={`font-mono text-sm px-2 py-0.5 rounded ${isLong ? 'text-red-400 bg-red-900/20' : 'text-gray-300 bg-gray-800'}`}>
      ⏱ {mm}:{ss}
    </span>
  );
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuthStore();
  const { boardState, messages, gameStatus, winner, error, sendMove, sendChat, resign } = useGameSocket(gameId);

  if (!boardState) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-xl text-gray-400 animate-pulse">Connecting to game...</div>
    </div>
  );

  const playerColor = boardState.currentTurn;
  const isMyTurn = boardState.currentTurn === playerColor;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-screen bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {isMyTurn ? '⚡ Your turn' : '⏳ Opponent\'s turn'} — Move #{boardState.moveCount + 1}
          </span>
          {gameStatus === 'active' && (
            <MoveTimer moveCount={boardState.moveCount} active={gameStatus === 'active'} />
          )}
        </div>

        {error && <div className="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded">{error}</div>}

        {gameStatus === 'completed' && (
          <div className="text-xl font-bold text-center px-6 py-3 rounded-lg bg-gray-800">
            {winner === user?.id ? '🏆 You won!' : winner ? '😞 You lost!' : '🤝 Draw!'}
          </div>
        )}

        <CheckersBoard
          boardState={boardState}
          playerColor={playerColor}
          onMove={sendMove}
          disabled={gameStatus !== 'active' || !isMyTurn}
        />

        {gameStatus === 'active' && (
          <button onClick={resign} className="px-6 py-2 border border-red-700 hover:bg-red-900/30 text-red-400 rounded transition text-sm">
            Resign
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 w-full lg:w-80">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="font-bold text-gray-300 mb-2">Game Info</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <div>Rules: <span className="text-white capitalize">{boardState.rulesType}</span></div>
            <div>Status: <span className="text-white capitalize">{gameStatus}</span></div>
          </div>
        </div>
        <GameChat messages={messages} onSend={sendChat} currentUserId={user?.id || ''} />
      </div>
    </div>
  );
}
