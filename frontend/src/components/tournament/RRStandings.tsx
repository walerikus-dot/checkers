'use client';

interface Standing {
  user: { id: string; username: string } | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

interface Match {
  id: string;
  round: number;
  position: number;
  player1: { id: string; username: string } | null;
  player2: { id: string; username: string } | null;
  winner: { id: string; username: string } | null;
  status: string;
}

interface Round {
  round: number;
  label: string;
  matches: Match[];
}

interface Props {
  rounds: Round[];
  standings: Standing[];
  currentUserId?: string;
  adminKey?: string;
  onReportResult?: (matchId: string, winnerId: string | null) => void;
}

export default function RRStandings({
  rounds,
  standings,
  currentUserId,
  adminKey,
  onReportResult,
}: Props) {
  const canReport = !!adminKey && !!onReportResult;

  return (
    <div className="space-y-6">
      {/* Standings table */}
      <div>
        <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-widest mb-3">Standings</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left w-8">#</th>
                <th className="px-4 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-center">W</th>
                <th className="px-3 py-2 text-center">D</th>
                <th className="px-3 py-2 text-center">L</th>
                <th className="px-3 py-2 text-center font-bold text-gray-300">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.user?.id ?? i}
                  className={`border-b border-gray-700/50 last:border-0 ${
                    s.user?.id === currentUserId ? 'bg-purple-900/20' : ''
                  }`}>
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-white">
                    {s.user?.username ?? '—'}
                    {i === 0 && standings[0].points > 0 && (
                      <span className="ml-2 text-xs text-amber-400">🏆</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-green-400">{s.wins}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{s.draws}</td>
                  <td className="px-3 py-2 text-center text-red-400">{s.losses}</td>
                  <td className="px-3 py-2 text-center font-bold text-white">{s.points}</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-600">No results yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-2">Points: Win = 3, Draw = 1, Loss = 0</p>
      </div>

      {/* Match schedule by round */}
      <div>
        <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-widest mb-3">Schedule</h3>
        <div className="space-y-4">
          {rounds.map((round) => (
            <div key={round.round}>
              <div className="text-xs text-gray-500 font-semibold uppercase mb-2">{round.label}</div>
              <div className="space-y-2">
                {round.matches.map((match) => {
                  const isDone  = match.status === 'done';
                  const isReady = match.status === 'ready';
                  const isBye   = match.status === 'bye';
                  return (
                    <div key={match.id}
                      className={`flex items-center gap-3 bg-gray-800/60 border rounded-lg px-4 py-2 text-sm ${
                        isDone  ? 'border-gray-600' :
                        isReady ? 'border-amber-700/40' :
                                  'border-gray-700'
                      }`}>
                      <span className={`flex-1 text-right truncate ${
                        isDone && match.winner?.id === match.player1?.id ? 'text-amber-300 font-semibold' :
                        isDone ? 'text-gray-500' : 'text-gray-200'
                      }`}>
                        {match.player1?.username ?? '—'}
                      </span>
                      <span className="text-gray-600 text-xs w-8 text-center">
                        {isDone ? 'vs' : isReady ? '⚡' : isBye ? 'BYE' : '⏳'}
                      </span>
                      <span className={`flex-1 truncate ${
                        isDone && match.winner?.id === match.player2?.id ? 'text-amber-300 font-semibold' :
                        isDone ? 'text-gray-500' : 'text-gray-200'
                      }`}>
                        {match.player2?.username ?? (isBye ? '' : '—')}
                      </span>
                      {/* Admin result buttons */}
                      {canReport && isReady && (
                        <div className="flex gap-1 ml-2 shrink-0">
                          {match.player1 && (
                            <button onClick={() => onReportResult!(match.id, match.player1!.id)}
                              className="px-2 py-0.5 bg-green-900 hover:bg-green-700 text-green-300 text-xs rounded transition">
                              {match.player1.username.slice(0, 6)} wins
                            </button>
                          )}
                          {match.player2 && (
                            <button onClick={() => onReportResult!(match.id, match.player2!.id)}
                              className="px-2 py-0.5 bg-green-900 hover:bg-green-700 text-green-300 text-xs rounded transition">
                              {match.player2.username.slice(0, 6)} wins
                            </button>
                          )}
                          <button onClick={() => onReportResult!(match.id, null)}
                            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition">
                            Draw
                          </button>
                        </div>
                      )}
                      {isDone && match.winner && (
                        <span className="text-amber-400 text-xs ml-2 shrink-0">
                          🏆 {match.winner.username}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
