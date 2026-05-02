'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendsApi, usersApi, gamesApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getSocket } from '../../lib/socket';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const RULES = ['russian', 'international', 'english'] as const;

function Avatar({ username }: { username: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-sm shrink-0">
      {username[0].toUpperCase()}
    </div>
  );
}

interface ChallengeState {
  friendId: string;
  rules: string;
  loading: boolean;
  gameId: string | null;
}

export default function FriendsPage() {
  const qc = useQueryClient();
  const { accessToken } = useAuthStore();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [onlineOverrides, setOnlineOverrides] = useState<Record<string, boolean>>({});
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);

  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: () => friendsApi.list().then(r => r.data) });

  // Subscribe to real-time online/offline events
  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    const handleOnline = ({ userId }: { userId: string }) =>
      setOnlineOverrides(prev => ({ ...prev, [userId]: true }));
    const handleOffline = ({ userId }: { userId: string }) =>
      setOnlineOverrides(prev => ({ ...prev, [userId]: false }));
    socket.on('status:online', handleOnline);
    socket.on('status:offline', handleOffline);
    return () => {
      socket.off('status:online', handleOnline);
      socket.off('status:offline', handleOffline);
    };
  }, [accessToken]);
  const { data: requests = [] } = useQuery({ queryKey: ['friend-requests'], queryFn: () => friendsApi.requests().then(r => r.data) });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => friendsApi.accept(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['friends'] }); qc.invalidateQueries({ queryKey: ['friend-requests'] }); },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => friendsApi.remove(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await usersApi.search(q);
    setSearchResults(data);
  };

  const sendRequest = async (userId: string) => {
    await friendsApi.sendRequest(userId);
    setSearchResults(prev => prev.filter(u => u.id !== userId));
  };

  const openChallenge = (friendId: string) =>
    setChallenge({ friendId, rules: 'russian', loading: false, gameId: null });

  const createChallenge = async () => {
    if (!challenge) return;
    setChallenge(c => c ? { ...c, loading: true } : null);
    try {
      const { data } = await gamesApi.createPrivate(challenge.rules);
      setChallenge(c => c ? { ...c, loading: false, gameId: data.id } : null);
    } catch {
      setChallenge(c => c ? { ...c, loading: false } : null);
    }
  };

  const goToGame = () => {
    if (challenge?.gameId) router.push(`/play/${challenge.gameId}`);
  };

  const gameLink = challenge?.gameId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/play/${challenge.gameId}`
    : '';

  const pendingCount = requests.length;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-amber-400 mb-6">Friends</h1>

      {/* Challenge modal */}
      {challenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setChallenge(null)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-amber-400 mb-4">⚔ Challenge to a game</h3>

            {!challenge.gameId ? (
              <>
                <p className="text-sm text-gray-400 mb-3">Choose a ruleset:</p>
                <div className="flex gap-2 mb-5">
                  {RULES.map(r => (
                    <button key={r} onClick={() => setChallenge(c => c ? { ...c, rules: r } : null)}
                      className={`flex-1 py-2 rounded text-sm capitalize font-medium transition ${
                        challenge.rules === r ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={createChallenge} disabled={challenge.loading}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg transition">
                    {challenge.loading ? 'Creating…' : 'Create game'}
                  </button>
                  <button onClick={() => setChallenge(null)}
                    className="px-4 py-2.5 border border-gray-600 hover:border-gray-400 rounded-lg text-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-2">Game created! Share this link with your friend:</p>
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4">
                  <span className="text-xs text-gray-300 flex-1 truncate font-mono">{gameLink}</span>
                  <button onClick={() => navigator.clipboard.writeText(gameLink)}
                    className="text-xs text-amber-400 hover:text-amber-300 shrink-0">Copy</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={goToGame}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition">
                    Join game →
                  </button>
                  <button onClick={() => setChallenge(null)}
                    className="px-4 py-2.5 border border-gray-600 hover:border-gray-400 rounded-lg text-gray-300 transition">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search players by username..."
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {searchResults.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 last:border-0">
                <Avatar username={u.username} />
                <Link href={`/profile/${u.id}`} className="flex-1 font-medium hover:text-amber-400 transition">
                  {u.username}
                </Link>
                <button onClick={() => sendRequest(u.id)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded transition">
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['friends', 'requests'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition capitalize relative ${
              activeTab === tab ? 'text-amber-400 border-b-2 border-amber-400 -mb-px' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {tab === 'requests' ? `Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}` : 'Friends'}
          </button>
        ))}
      </div>

      {/* Friends list */}
      {activeTab === 'friends' && (
        <div className="space-y-2">
          {friends.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <p className="text-3xl mb-3">👥</p>
              <p>No friends yet. Search for players above.</p>
            </div>
          )}
          {friends.map((f: any) => {
            const friend = f.friend;
            const isOnline = onlineOverrides[friend.id] ?? friend.isOnline;
            return (
              <div key={f.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                <Avatar username={friend.username} />
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${friend.id}`} className="font-medium hover:text-amber-400 transition">
                    {friend.username}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="text-xs text-gray-500">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
                <button onClick={() => openChallenge(friend.id)}
                  className="text-xs text-amber-500 hover:text-amber-400 transition px-2 py-1 rounded hover:bg-amber-900/20 font-medium">
                  ⚔ Challenge
                </button>
                <button onClick={() => removeMutation.mutate(friend.id)}
                  className="text-xs text-gray-600 hover:text-red-400 transition px-2 py-1 rounded hover:bg-red-900/20">
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="text-center py-12 text-gray-600">No pending requests.</div>
          )}
          {requests.map((req: any) => (
            <div key={req.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <Avatar username={req.user.username} />
              <div className="flex-1">
                <Link href={`/profile/${req.user.id}`} className="font-medium hover:text-amber-400 transition">
                  {req.user.username}
                </Link>
                <div className="text-xs text-gray-500 mt-0.5">Wants to be friends</div>
              </div>
              <button onClick={() => acceptMutation.mutate(req.id)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded transition">
                Accept
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
