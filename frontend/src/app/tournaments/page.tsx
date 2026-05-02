'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '../../lib/api';
import Link from 'next/link';

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: 'Single Elim',
  round_robin:        'Round Robin',
};

const RULES_LABELS: Record<string, string> = {
  russian:       'Russian 8×8',
  english:       'English 8×8',
  international: 'International 10×10',
};

const STATUS_COLORS: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-900/30',
  active:    'text-green-400 bg-green-900/30',
  completed: 'text-gray-400 bg-gray-700',
  cancelled: 'text-red-400 bg-red-900/30',
};

const CRON_PRESETS = [
  { label: 'Every day at 18:00',       value: '0 18 * * *' },
  { label: 'Every day at 12:00',       value: '0 12 * * *' },
  { label: 'Every Saturday at 18:00',  value: '0 18 * * 6' },
  { label: 'Every Sunday at 15:00',    value: '0 15 * * 0' },
  { label: 'Every Monday at 18:00',    value: '0 18 * * 1' },
  { label: 'Custom…',                  value: 'custom' },
];

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Admin Schedule Panel ──────────────────────────────────────────────────────

function SchedulePanel({ adminKey }: { adminKey: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '', format: 'single_elimination', rulesType: 'russian',
    maxPlayers: 8, cronPreset: '0 18 * * *', customCron: '',
    registrationHours: 2, enabled: true,
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', adminKey],
    queryFn: () => tournamentsApi.listSchedules(adminKey).then(r => r.data),
    enabled: !!adminKey,
  });

  const createMut = useMutation({
    mutationFn: () => tournamentsApi.createSchedule({
      name: form.name,
      format: form.format,
      rulesType: form.rulesType,
      maxPlayers: form.maxPlayers,
      cronExpression: form.cronPreset === 'custom' ? form.customCron : form.cronPreset,
      registrationHours: form.registrationHours,
      enabled: form.enabled,
    }, adminKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules', adminKey] });
      setShowAdd(false);
      setForm(f => ({ ...f, name: '' }));
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Error creating schedule'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      tournamentsApi.updateSchedule(id, { enabled }, adminKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', adminKey] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => tournamentsApi.deleteSchedule(id, adminKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', adminKey] }),
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <div className="bg-gray-800 border border-red-900/30 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest">Auto-Schedules</h2>
        <button onClick={() => setShowAdd(s => !s)}
          className="px-3 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs rounded-lg transition">
          + New Schedule
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 mb-4 space-y-3">
          <input
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Schedule name (e.g. Daily Russian 8p)"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-red-500"
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Format</label>
              <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none">
                <option value="single_elimination">Single Elim</option>
                <option value="round_robin">Round Robin</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rules</label>
              <select value={form.rulesType} onChange={e => setForm(f => ({ ...f, rulesType: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none">
                <option value="russian">Russian</option>
                <option value="english">English</option>
                <option value="international">International</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Max players</label>
              <select value={form.maxPlayers} onChange={e => setForm(f => ({ ...f, maxPlayers: +e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none">
                {[4, 8, 16, 32].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Schedule (cron)</label>
              <select
                value={form.cronPreset}
                onChange={e => setForm(f => ({ ...f, cronPreset: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none">
                {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {form.cronPreset === 'custom' && (
                <input
                  value={form.customCron}
                  onChange={e => setForm(f => ({ ...f, customCron: e.target.value }))}
                  placeholder="* * * * *"
                  className="mt-1 w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Registration window (hours)</label>
              <select value={form.registrationHours} onChange={e => setForm(f => ({ ...f, registrationHours: +e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none">
                {[1, 2, 4, 6, 12, 24].map(n => <option key={n} value={n}>{n}h</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMut.mutate()} disabled={!form.name || createMut.isPending}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition">
              {createMut.isPending ? 'Creating…' : 'Create Schedule'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-gray-500 hover:text-gray-300 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Schedule list */}
      {isLoading && <div className="text-gray-600 text-sm animate-pulse">Loading schedules…</div>}
      {!isLoading && schedules.length === 0 && (
        <div className="text-gray-600 text-sm py-4 text-center">No auto-schedules configured.</div>
      )}
      <div className="space-y-2">
        {schedules.map((s: any) => (
          <div key={s.id}
            className={`flex items-center gap-3 bg-gray-900/40 border rounded-lg px-4 py-3 ${
              s.enabled ? 'border-gray-700' : 'border-gray-700/40 opacity-60'
            }`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{s.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {FORMAT_LABELS[s.format]} · {RULES_LABELS[s.rulesType]} · {s.maxPlayers}p
                {' · '}<code className="font-mono text-gray-400">{s.cronExpression}</code>
                {' · '}{s.registrationHours}h reg
              </div>
              {s.nextRunAt && (
                <div className="text-xs text-gray-600 mt-0.5">
                  Next: {new Date(s.nextRunAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleMut.mutate({ id: s.id, enabled: !s.enabled })}
                className={`text-xs px-2 py-1 rounded transition ${
                  s.enabled
                    ? 'bg-green-900/40 text-green-400 hover:bg-green-900/70'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}>
                {s.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id); }}
                className="text-xs text-red-700 hover:text-red-400 transition px-1">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [form, setForm] = useState({
    name: '', format: 'single_elimination', rulesType: 'russian',
    maxPlayers: 8, startsAt: '',
  });

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentsApi.list().then(r => r.data),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => tournamentsApi.create({
      name: form.name,
      format: form.format,
      rulesType: form.rulesType,
      maxPlayers: form.maxPlayers,
      startsAt: form.startsAt || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      setShowCreate(false);
      setForm({ name: '', format: 'single_elimination', rulesType: 'russian', maxPlayers: 8, startsAt: '' });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Error creating tournament'),
  });

  const pending   = tournaments.filter((t: any) => t.status === 'pending');
  const active    = tournaments.filter((t: any) => t.status === 'active');
  const completed = tournaments.filter((t: any) => ['completed', 'cancelled'].includes(t.status));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Title + actions */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-amber-400">🏆 Tournaments</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(s => !s)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm transition">
            + Create
          </button>
          <button onClick={() => setShowAdminKey(s => !s)}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition">
            ⚙ Admin
          </button>
        </div>
      </div>

      {/* Admin key entry */}
      {showAdminKey && (
        <div className="mb-4">
          <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)}
            placeholder="Enter admin key to unlock schedule management"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
          />
        </div>
      )}

      {/* Admin schedule panel */}
      {adminKey && <SchedulePanel adminKey={adminKey} />}

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-800 border border-amber-500/30 rounded-xl p-5 mb-6 space-y-4">
          <h2 className="font-bold text-amber-400">New Tournament</h2>
          <input
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Tournament name"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-amber-500"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Format</label>
              <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500">
                <option value="single_elimination">Single Elim</option>
                <option value="round_robin">Round Robin</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Rules</label>
              <select value={form.rulesType} onChange={e => setForm(p => ({ ...p, rulesType: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500">
                <option value="russian">Russian</option>
                <option value="english">English</option>
                <option value="international">International</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Max players</label>
              <select value={form.maxPlayers} onChange={e => setForm(p => ({ ...p, maxPlayers: +e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500">
                {[4, 8, 16, 32].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Starts at (optional)</label>
              <input type="datetime-local" value={form.startsAt}
                onChange={e => setForm(p => ({ ...p, startsAt: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg text-sm transition">
              {createMutation.isPending ? 'Creating…' : 'Create Tournament'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-gray-400 animate-pulse">Loading…</div>}

      {/* Active tournaments */}
      {active.length > 0 && (
        <TournamentSection label="🔥 In Progress" items={active} />
      )}

      {/* Pending / upcoming */}
      {pending.length > 0 && (
        <TournamentSection label="⏳ Upcoming" items={pending} />
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <TournamentSection label="Completed" items={completed} muted />
      )}

      {!isLoading && tournaments.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-4">🏆</p>
          <p>No tournaments yet. Create the first one!</p>
        </div>
      )}
    </div>
  );
}

function TournamentSection({ label, items, muted = false }: {
  label: string; items: any[]; muted?: boolean;
}) {
  return (
    <div className="mb-8">
      <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted ? 'text-gray-600' : 'text-gray-400'}`}>
        {label}
      </h2>
      <div className="space-y-3">
        {items.map((t: any) => (
          <Link key={t.id} href={`/tournaments/${t.id}`}
            className="flex items-center gap-4 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-xl px-5 py-4 transition group">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white group-hover:text-amber-400 transition truncate">{t.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {FORMAT_LABELS[t.format] ?? t.format}
                {' · '}{RULES_LABELS[t.rulesType] ?? t.rulesType}
                {' · '}{t.participantCount ?? 0} / {t.maxPlayers} players
                {t.startsAt && ` · ${formatDate(t.startsAt)}`}
                {t.autoStarted && <span className="ml-1 text-gray-600">• auto</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {t.createdBy && (
                <span className="text-xs text-gray-500 hidden sm:block">by {t.createdBy.username}</span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[t.status] ?? STATUS_COLORS.pending}`}>
                {t.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
