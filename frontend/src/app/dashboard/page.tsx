'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { gamesApi } from '../../lib/api';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const RULES = ['russian', 'international', 'english'] as const;

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [rulesType, setRulesType] = useState<string>('russian');
  const [loading, setLoading] = useState(false);
  const [matchmaking, setMatchmaking] = useState<'idle' | 'waiting' | 'matched'>('idle');
  const [queuePos, setQueuePos] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startQuickPlay = async () => {
    setLoading(true);
    try {
      const { data } = await gamesApi.quickPlay(rulesType);
      if (data.status === 'matched' && data.gameId) {
        setMatchmaking('matched');
        router.push(`/play/${data.gameId}`);
        return;
      }
      // Waiting — start polling
      setMatchmaking('waiting');
      setQueuePos(data.position || 1);
      pollRef.current = setInterval(async () => {
        try {
          const { data: poll } = await gamesApi.quickPlay(rulesType);
          if (poll.status === 'matched' && poll.gameId) {
            clearInterval(pollRef.current!);
            setMatchmaking('matched');
            router.push(`/play/${poll.gameId}`);
          } else if (poll.position !== undefined) {
            setQueuePos(poll.position);
          }
        } catch { /* ignore poll errors */ }
      }, 3000);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to join queue');
    } finally {
      setLoading(false);
    }
  };

  const cancelMatchmaking = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setMatchmaking('idle');
    try { await gamesApi.cancelQuickPlay(); } catch { /* ignore */ }
  };

  const handlePrivate = async () => {
    setLoading(true);
    try {
      const { data } = await gamesApi.createPrivate(rulesType);
      router.push(`/play/${data.id}`);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to create game');
    } finally { setLoading(false); }
  };

  const winRate = user?.rating?.gamesPlayed
    ? Math.round((user.rating.wins / user.rating.gamesPlayed) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Play card */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-lg font-bold mb-4">Play</h2>

            {/* Rules selector */}
            <div className="mb-4">
              <label className="text-xs text-gray-400 block mb-2 uppercase tracking-wide">Ruleset</label>
              <div className="flex gap-2">
                {RULES.map(r => (
                  <button key={r} onClick={() => setRulesType(r)} disabled={matchmaking !== 'idle'}
                    className={`px-3 py-1.5 rounded text-sm capitalize transition ${
                      rulesType === r ? 'bg-amber-500 text-black font-bold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    } disabled:opacity-40`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {matchmaking === 'idle' && (
              <div className="space-y-3">
                <button onClick={startQuickPlay} disabled={loading}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg transition">
                  {loading ? 'Joining...' : '⚡ Quick Play'}
                </button>
                <button onClick={handlePrivate} disabled={loading}
                  className="w-full py-2.5 border border-gray-600 hover:border-gray-400 rounded-lg transition text-gray-300 text-sm">
                  Create Private Game
                </button>
                <Link href="/tournaments"
                  className="block w-full py-2.5 border border-gray-600 hover:border-gray-400 rounded-lg transition text-gray-300 text-sm text-center">
                  🏆 Tournaments
                </Link>
              </div>
            )}

            {matchmaking === 'waiting' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-amber-400 font-medium">Finding opponent…</p>
                  <p className="text-xs text-gray-500">{queuePos} player{queuePos !== 1 ? 's' : ''} in queue · {rulesType}</p>
                </div>
                <button onClick={cancelMatchmaking}
                  className="w-full py-2 border border-gray-600 hover:border-red-700 rounded-lg text-gray-400 hover:text-red-400 text-sm transition">
                  Cancel
                </button>
              </div>
            )}

            {matchmaking === 'matched' && (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-green-400 font-bold text-lg">Match found!</p>
                <p className="text-xs text-gray-500 animate-pulse">Loading game…</p>
              </div>
            )}
          </div>

          {/* Stats card */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Your Stats</h2>
              <Link href={`/profile/${user?.id}`} className="text-xs text-amber-400 hover:text-amber-300 transition">
                View profile →
              </Link>
            </div>
            {user?.rating ? (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-400">Rating</span>
                  <span className="text-amber-400 font-bold text-2xl">{Math.round(user.rating.rating)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Games played</span>
                  <span className="text-white">{user.rating.gamesPlayed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Win rate</span>
                  <span className="text-white">{winRate}%</span>
                </div>
                <div className="flex gap-4 text-sm pt-1 border-t border-gray-700">
                  <span className="text-green-400">W {user.rating.wins}</span>
                  <span className="text-red-400">L {user.rating.losses}</span>
                  <span className="text-gray-500">D {user.rating.draws}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Play your first game to get a rating.</p>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/leaderboard', label: '🏅 Leaderboard' },
            { href: '/history',     label: '📋 Game History' },
            { href: '/friends',     label: '👥 Friends' },
          ].map(({ href, label }) => (
            <Link key={href} href={href}
              className="bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-lg p-4 text-center text-sm text-gray-300 hover:text-white transition">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
