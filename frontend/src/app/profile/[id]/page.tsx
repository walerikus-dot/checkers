'use client';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/auth.store';
import { usersApi, gamesApi, friendsApi, authApi } from '../../../lib/api';
import Link from 'next/link';
import { useState } from 'react';

function StatBox({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, setUser } = useAuthStore();
  const qc = useQueryClient();
  const isOwnProfile = me?.id === id;
  const [friendMsg, setFriendMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => usersApi.getProfile(id).then(r => r.data),
    enabled: !!id,
  });

  const { data: games } = useQuery({
    queryKey: ['history', id],
    queryFn: () => gamesApi.history(id).then(r => r.data),
    enabled: !!id,
  });

  const handleAddFriend = async () => {
    try {
      await friendsApi.sendRequest(id);
      setFriendMsg('Friend request sent!');
    } catch {
      setFriendMsg('Could not send request.');
    }
  };

  const handleEditStart = () => {
    setEditUsername(profile?.username || '');
    setEditError('');
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!editUsername.trim()) return;
    setEditLoading(true);
    setEditError('');
    try {
      await usersApi.update(id, { username: editUsername.trim() });
      qc.invalidateQueries({ queryKey: ['profile', id] });
      const { data: freshUser } = await authApi.me();
      setUser(freshUser);
      setEditing(false);
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Failed to save');
    } finally {
      setEditLoading(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-20 text-gray-400 animate-pulse">Loading profile...</div>;
  if (!profile) return <div className="text-center py-20 text-gray-500">User not found.</div>;

  const rating = profile.rating;
  const winRate = rating?.gamesPlayed > 0 ? Math.round(rating.wins / rating.gamesPlayed * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-5 mb-8">
        <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-2xl">
          {profile.username[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{profile.username}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${profile.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
            <span className="text-sm text-gray-400">{profile.isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        {!isOwnProfile && me && (
          <div className="flex flex-col items-end gap-1">
            <button onClick={handleAddFriend}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm transition">
              + Add Friend
            </button>
            {friendMsg && <span className="text-xs text-gray-400">{friendMsg}</span>}
          </div>
        )}
        {isOwnProfile && (
          <div className="flex items-center gap-2">
            <button onClick={handleEditStart}
              className="px-3 py-2 border border-gray-600 hover:border-amber-500 hover:text-amber-400 rounded-lg text-sm text-gray-300 transition">
              ✏️ Edit
            </button>
            <Link href="/friends" className="px-4 py-2 border border-gray-600 hover:border-gray-400 rounded-lg text-sm text-gray-300 transition">
              Friends List
            </Link>
          </div>
        )}
      </div>

      {/* Edit profile inline form */}
      {editing && (
        <div className="mb-6 bg-gray-800 border border-amber-500/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-3">Edit Profile</h3>
          {editError && <p className="text-xs text-red-400 mb-2">{editError}</p>}
          <div className="flex gap-2">
            <input
              value={editUsername}
              onChange={e => setEditUsername(e.target.value)}
              placeholder="Username"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
            />
            <button onClick={handleSaveProfile} disabled={editLoading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-bold rounded-lg transition">
              {editLoading ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-600 hover:border-gray-400 text-gray-300 text-sm rounded-lg transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {rating ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatBox label="Rating" value={Math.round(rating.rating)} color="text-amber-400" />
          <StatBox label="Games" value={rating.gamesPlayed} />
          <StatBox label="Win Rate" value={`${winRate}%`} color="text-green-400" />
          <StatBox label="W / L / D" value={`${rating.wins}/${rating.losses}/${rating.draws}`} />
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-8 text-gray-500 text-sm text-center">
          No rated games yet.
        </div>
      )}

      {/* Recent Games */}
      <h2 className="text-lg font-bold text-gray-300 mb-3">Recent Games</h2>
      {!games || games.length === 0 ? (
        <div className="text-gray-600 text-sm">No games found.</div>
      ) : (
        <div className="space-y-2">
          {games.slice(0, 10).map((game: any) => {
            const opponent = game.playerWhite?.id === id ? game.playerBlack : game.playerWhite;
            const won = game.winner?.id === id;
            const isDraw = game.status === 'completed' && !game.winner;
            return (
              <div key={game.id}
                className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                  isDraw ? 'bg-gray-700 text-gray-300' : won ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
                }`}>
                  {isDraw ? 'Draw' : won ? 'Win' : 'Loss'}
                </span>
                <span className="flex-1 truncate text-gray-300">
                  vs <span className="text-white">{opponent?.username || '?'}</span>
                </span>
                <span className="text-gray-600 capitalize text-xs shrink-0">{game.rulesType}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
