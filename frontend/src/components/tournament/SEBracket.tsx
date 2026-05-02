'use client';

interface Match {
  id: string;
  round: number;
  position: number;
  player1: { id: string; username: string } | null;
  player2: { id: string; username: string } | null;
  winner: { id: string; username: string } | null;
  status: string;
  nextMatchId: string | null;
}

interface Round {
  round: number;
  label: string;
  matches: Match[];
}

interface Props {
  rounds: Round[];
  currentUserId?: string;
  adminKey?: string;
  onReportResult?: (matchId: string, winnerId: string | null) => void;
}

function MatchCard({
  match,
  currentUserId,
  adminKey,
  onReportResult,
}: {
  match: Match;
  currentUserId?: string;
  adminKey?: string;
  onReportResult?: (matchId: string, winnerId: string | null) => void;
}) {
  const isBye    = match.status === 'bye';
  const isDone   = match.status === 'done';
  const isReady  = match.status === 'ready';
  const canReport = !!adminKey && isReady && !!onReportResult;

  const playerRow = (player: { id: string; username: string } | null, isWinner: boolean, label: string) => (
    <div className={`flex items-center justify-between px-2 py-1 rounded text-sm ${
      isDone && isWinner
        ? 'bg-amber-900/40 text-amber-300 font-semibold'
        : isDone && !isWinner
        ? 'text-gray-600 line-through'
        : player?.id === currentUserId
        ? 'text-purple-300'
        : 'text-gray-300'
    }`}>
      <span className="truncate max-w-[110px]">
        {player?.username ?? <span className="text-gray-600 italic">{label}</span>}
      </span>
      {isDone && isWinner && <span className="text-amber-400 text-xs ml-1">🏆</span>}
      {canReport && player && (
        <button
          onClick={() => onReportResult!(match.id, player.id)}
          className="ml-2 px-1.5 py-0.5 bg-green-800 hover:bg-green-600 text-green-200 text-xs rounded transition"
        >
          Win
        </button>
      )}
    </div>
  );

  return (
    <div className={`bg-gray-800 border rounded-lg overflow-hidden w-44 ${
      isBye   ? 'border-gray-700 opacity-60' :
      isDone  ? 'border-gray-600' :
      isReady ? 'border-amber-700/60' :
                'border-gray-700 opacity-50'
    }`}>
      <div className="px-2 pt-1 pb-0.5 border-b border-gray-700/60">
        {playerRow(match.player1, match.winner?.id === match.player1?.id, 'TBD')}
      </div>
      <div className="px-2 pt-0.5 pb-1">
        {playerRow(match.player2, match.winner?.id === match.player2?.id, isBye ? 'BYE' : 'TBD')}
      </div>
      {isBye && (
        <div className="text-center text-xs text-gray-600 pb-1">bye</div>
      )}
    </div>
  );
}

export default function SEBracket({ rounds, currentUserId, adminKey, onReportResult }: Props) {
  if (!rounds || rounds.length === 0) {
    return <div className="text-gray-500 text-sm py-8 text-center">Bracket not generated yet.</div>;
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-max">
        {rounds.map((round) => (
          <div key={round.round} className="flex flex-col gap-2">
            {/* Round header */}
            <div className="text-center text-xs font-semibold text-amber-500 uppercase tracking-widest mb-2 px-2">
              {round.label}
            </div>

            {/* Matches — vertically spaced to align with bracket lines */}
            <div
              className="flex flex-col"
              style={{ gap: `${Math.pow(2, round.round - 1) * 12 + 8}px` }}
            >
              {round.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  currentUserId={currentUserId}
                  adminKey={adminKey}
                  onReportResult={onReportResult}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
