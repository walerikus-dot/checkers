'use client';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';

export default function LeaderboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['leaderboard'], queryFn: () => usersApi.leaderboard(50).then(r => r.data) });

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-amber-400 mb-8">Leaderboard</h1>
        {isLoading ? <div className="text-gray-400 animate-pulse">Loading...</div> : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700"><tr>
                <th className="px-4 py-3 text-left text-gray-400 text-sm">#</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm">Player</th>
                <th className="px-4 py-3 text-right text-gray-400 text-sm">Rating</th>
                <th className="px-4 py-3 text-right text-gray-400 text-sm">W/L/D</th>
              </tr></thead>
              <tbody>{(data || []).map((user: any, i: number) => (
                <tr key={user.id} className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="px-4 py-3 text-gray-400 text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-bold">{Math.round(user.rating?.rating || 1500)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">
                    {user.rating?.wins || 0}/{user.rating?.losses || 0}/{user.rating?.draws || 0}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
