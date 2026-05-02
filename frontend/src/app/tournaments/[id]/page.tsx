'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '../../../lib/api';
import { useAuthStore } from '../../../store/auth.store';
import SEBracket from '../../../components/tournament/SEBracket';
import RRStandings from '../../../components/tournament/RRStandings';
import Link from 'next/link';

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: 'Single Elimination',
  round_robin:        'Round Robin',
};

const RULES_LABELS: Record<string, string> = {
  russian:       'Russian 8×8',
  english:       'English 8×8',
  international: 'International 10×10',
};

function AdminPanel({
  tournament, adminKey, onAction,
}: {
  tournament: any;
  adminKey: string;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState('');

  const act = async (label: string, fn: () => Promise<any>) => {
    setLoading(label);
    try { await fn(); onAction(); }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Error'); }
    finally { setLoading(''); }
  };

  return (
    <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 mt-4">
      <p className="text-xs text-red-400 font-semibold uppercase tracking-widest mb-3">Admin</p>
      <div className="flex flex-wrap gap-2">
        {tournament.status === 'pending' && (
          <button disabled={!!loading}
            onClick={() => act('start', () => tournamentsApi.adminStart(tournament.id, adminKey))}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition">
            {loading === 'start' ? '…' : '▶ Start'}
          </button>
        )}
        {(tournament.status === 'pending' || tournament.status === 'active') && (
          <button disabled={!!loading}
            onClick={() => { if (confirm('Cancel tournament?')) act('cancel', () => tournamentsApi.adminCancel(tournament.id, adminKey)); }}
            className="px-4 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition">
            {loading === 'cancel' ? '…' : '✕ Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [adminKey, setAdminKey] = useState('');
  const [showAdminInput, setShowAdminInput] = useState(false);

  const { data: tournament, isLoading: tLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentsApi.get(id).then(r => r.data),
    enabled: !!id,
  });

  const { data: bracket, isLoading: bLoading } = useQuery({
    queryKey: ['bracket', id],
    queryFn: () => tournamentsApi.getBracket(id).then(r => r.data),
    enabled: !!id && tournament?.status !== 'pending',
    refetchInterval: tournament?.status === 'active' ? 15_000 : false,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants', id],
    queryFn: () => tournamentsApi.getParticipants(id).then(r => r.data),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => tournamentsApi.join(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['participants', id] }),
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Could not join'),
  });

  const leaveMutation = useMutation({
    mutationFn: () => tournamentsApi.leave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['participants', id] }),
  });

  const resultMutation = useMutation({
    mutationFn: ({ matchId, winnerId }: { matchId: string; winnerId: string | null }) =>
      tournamentsApi.adminResult(id, matchId, winnerId, adminKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bracket', id] });
      qc.invalidateQueries({ queryKey: ['tournament', id] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Error reporting result'),
  });

  if (tLoading) return <div className="flex justify-center py-20 text-gray-400 animate-pulse">Loading…</div>;
  if (!tournament) return <div className="text-center py-20 text-gray-500">Tournament not found.</div>;

  const isParticipant = user && participants.some((p: any) => p.userId === user.id);
  const isPending     = tournament.status === 'pending';
  const isActive      = tournament.status === 'active';
  const isCompleted   = tournament.status === 'completed';
  const isCancelled   = tournament.status === 'cancelled';
  const isRR          = tournament.format === 'round_robin';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament', id] });
    qc.invalidateQueries({ queryKey: ['bracket', id] });
    qc.invalidateQueries({ queryKey: ['participants', id] });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link href="/tournaments" className="text-gray-500 hover:text-gray-300 transition">← Tournaments</Link>
      </div>

      {/* Header card */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-amber-400">{tournament.name}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {FORMAT_LABELS[tournament.format] ?? tournament.format}
              {' · '}{RULES_LABELS[tournament.rulesType] ?? tournament.rulesType}
              {' · '}up to {tournament.maxPlayers} players
              {tournament.createdBy && ` · by ${tournament.createdBy.username}`}
            </p>
            {tournament.startsAt && (
              <p className="text-xs text-gray-500 mt-1">
                {isPending ? 'Starts' : 'Started'}: {new Date(tournament.startsAt).toLocaleString()}
              </p>
            )}
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize shrink-0 ${
            isActive    ? 'bg-green-900/40 text-green-400 border border-green-800' :
            isCompleted ? 'bg-gray-700 text-gray-400' :
            isCancelled ? 'bg-red-900/40 text-red-400 border border-red-800' :
                          'bg-yellow-900/40 text-yellow-400 border border-yellow-800'
          }`}>
            {tournament.status}
          </span>
        </div>

        {/* Player join/leave — only in pending */}
        {isPending && user && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
            {isParticipant ? (
              <button onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition">
                Leave tournament
              </button>
            ) : (
              <button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm rounded-lg transition">
                {joinMutation.isPending ? 'Joining…' : 'Join tournament'}
              </button>
            )}
            <span className="text-xs text-gray-500">
              {participants.length} / {tournament.maxPlayers} players registered
            </span>
          </div>
        )}

        {/* Admin panel toggle */}
        <div className="mt-4 pt-3 border-t border-gray-700/50">
          {!showAdminInput ? (
            <button onClick={() => setShowAdminInput(true)}
              className="text-xs text-gray-600 hover:text-gray-400 transition">
              Admin ▸
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
                placeholder="Admin key"
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500 w-44"
              />
              {adminKey && (
                <AdminPanel tournament={tournament} adminKey={adminKey} onAction={invalidate} />
              )}
              <button onClick={() => setShowAdminInput(false)} className="text-xs text-gray-600 ml-2">✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Participants sidebar (pending state) */}
      {isPending && participants.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Registered Players ({participants.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {participants.map((p: any) => (
              <span key={p.id}
                className={`px-3 py-1 rounded-full text-sm border ${
                  p.userId === user?.id
                    ? 'bg-purple-900/30 border-purple-700 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-300'
                }`}>
                {p.user?.username ?? '?'}
              </span>
            ))}
          </div>
          {participants.length < 2 && (
            <p className="text-xs text-gray-600 mt-3">Need at least 2 players before the tournament can start.</p>
          )}
        </div>
      )}

      {/* Bracket — active or completed */}
      {(isActive || isCompleted) && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {isRR ? 'Standings & Schedule' : 'Bracket'}
          </h2>
          {bLoading && <div className="text-gray-500 animate-pulse text-sm">Loading bracket…</div>}
          {bracket && !bLoading && (
            isRR ? (
              <RRStandings
                rounds={bracket.rounds}
                standings={bracket.standings ?? []}
                currentUserId={user?.id}
                adminKey={adminKey || undefined}
                onReportResult={(matchId, winnerId) =>
                  resultMutation.mutate({ matchId, winnerId })
                }
              />
            ) : (
              <SEBracket
                rounds={bracket.rounds}
                currentUserId={user?.id}
                adminKey={adminKey || undefined}
                onReportResult={(matchId, winnerId) =>
                  resultMutation.mutate({ matchId, winnerId })
                }
              />
            )
          )}
        </div>
      )}

      {isCancelled && (
        <div className="text-center py-10 text-gray-600">
          <p className="text-3xl mb-3">❌</p>
          <p>This tournament was cancelled.</p>
        </div>
      )}
    </div>
  );
}
