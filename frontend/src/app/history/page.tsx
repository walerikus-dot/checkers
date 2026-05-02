'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { gamesApi } from '../../lib/api';
import Link from 'next/link';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ResultBadge({ game, userId }: { game: any; userId: string }) {
  if (!game.winner) return <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">Draw</span>;
  const won = game.winner.id === userId;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${won ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
      {won ? 'Win' : 'Loss'}
    </span>
  );
}

export default function HistoryPage() {
  const { user } = useAuthStore();
  const { data: games, isLoading } = useQuery({
    queryKey: ['history', user?.id],
    queryFn: () => gamesApi.history(user?.id).then(r => r.data),
    enabled: !!user,
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-amber-400 mb-6">Game History</h1>

      {isLoading && <div className="text-gray-400 animate-pulse">Loading...</div>}

      {!isLoading && (!games || games.length === 0) && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-4">♟</p>
          <p>No games played yet.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-amber-400 hover:text-amber-300 text-sm">
            Start playing →
          </Link>
        </div>
      )}

      {games && games.length > 0 && (
        <div className="space-y-2">
          {games.map((game: any) => {
            const opponent = game.playerWhite?.id === user?.id ? game.playerBlack : game.playerWhite;
            const myColor = game.playerWhite?.id === user?.id ? 'White' : 'Black';
            return (
              <Link key={game.id} href={`/replay/${game.id}`}
                className="flex items-center gap-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 hover:border-gray-500 hover:bg-gray-800/80 transition group">
                <ResultBadge game={game} userId={user?.id || ''} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-amber-400 transition">
                    vs <span className="text-white">{opponent?.username || 'Unknown'}</span>
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {game.rulesType} · {myColor} · {formatDate(game.startedAt || game.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-600 capitalize">{game.status}</span>
                  <span className="text-xs text-gray-600 group-hover:text-amber-500 transition">▶ Replay</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
