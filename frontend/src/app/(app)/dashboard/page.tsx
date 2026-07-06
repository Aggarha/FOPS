'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, Music, Disc3, Layers, Video, Mic2, Cpu, Calendar,
  RefreshCw, Filter, Search, Activity, Clock, ChevronRight,
  CheckCircle2, AlertCircle, Circle, Loader2, Wifi, WifiOff,
  Zap, BarChart3, Globe,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { buildWebSocketUrl } from '@/lib/runtime';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetRelease {
  date: string;
  day?: string;
  eg_time?: string;
  ksa_time?: string;
  upc?: string;
  artist: string;
  song: string;
  release_type: string;
  number_of_tracks?: string;
  motion_graphics?: string;
  motion_team_member?: string;
  delivery_operations?: string;
  delivery_motion_editing?: string;
  delivery_youtube?: string;
  video_type?: string;
  label?: string;
  distribution_type?: string;
  google_drive_link?: string;
  artwork_1920x1080?: string;
  artwork_3000x3000?: string;
  artwork_600x600?: string;
  jpg_1920x1080?: string;
  jpg_3000x3000?: string;
  metadata_status?: string;
  lyrics_status?: string;
  link_anghami?: string;
  link_apple?: string;
  link_yango?: string;
  notes?: string;
}

interface UpcomingRelease extends SheetRelease {
  release_date: string;
}

interface Stats {
  total: number;
  singles: number;
  albums: number;
  eps: number;
  concerts: number;
  mv: number;
  lyrics_videos: number;
  ai: number;
}

interface FeedEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(val: string): string {
  const v = (val || '').toLowerCase();
  if (v === 'done' || v === 'yes' || v === '1' || v === 'true') return 'bg-green-500';
  if (v === 'pending' || v === 'in progress' || v === 'wip') return 'bg-yellow-400';
  if (v === 'no' || v === '0' || v === 'false' || v === 'missing') return 'bg-red-500';
  return 'bg-gray-700';
}

function statusLabel(val: string): { color: string; label: string } {
  const v = (val || '').toLowerCase().trim();
  if (v === 'done' || v === 'yes' || v === '1' || v === 'true') return { color: 'text-green-400 border-green-800 bg-green-950/40', label: 'Done' };
  if (v === 'pending') return { color: 'text-yellow-400 border-yellow-800 bg-yellow-950/40', label: 'Pending' };
  if (v === 'in progress' || v === 'wip') return { color: 'text-blue-400 border-blue-800 bg-blue-950/40', label: 'In Progress' };
  if (v === 'no' || v === '0' || v === 'false' || v === 'missing') return { color: 'text-red-400 border-red-800 bg-red-950/40', label: 'Missing' };
  if (v && v.length > 0) return { color: 'text-gray-300 border-gray-700 bg-gray-900/40', label: val };
  return { color: 'text-gray-600 border-gray-800 bg-transparent', label: '—' };
}

function typeColor(t: string): string {
  switch ((t || '').toLowerCase()) {
    case 'single': return 'text-blue-400 border-blue-800 bg-blue-950/30';
    case 'album': return 'text-purple-400 border-purple-800 bg-purple-950/30';
    case 'ep': return 'text-indigo-400 border-indigo-800 bg-indigo-950/30';
    case 'concert': return 'text-orange-400 border-orange-800 bg-orange-950/30';
    default: return 'text-gray-400 border-gray-700 bg-gray-900/30';
  }
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function feedLevelColor(level: FeedEntry['level']): string {
  switch (level) {
    case 'success': return 'text-green-400';
    case 'warn': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function feedLevelIcon(level: FeedEntry['level']) {
  switch (level) {
    case 'success': return <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />;
    case 'warn': return <AlertCircle className="w-3 h-3 text-yellow-400 shrink-0" />;
    case 'error': return <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />;
    default: return <Circle className="w-3 h-3 text-gray-600 shrink-0" />;
  }
}

// ─── Today Release Card ───────────────────────────────────────────────────────

function TodayReleaseCard({ r }: { r: SheetRelease }) {
  const ops = statusLabel(r.delivery_operations || '');
  const motion = statusLabel(r.delivery_motion_editing || '');
  const yt = statusLabel(r.delivery_youtube || '');

  return (
    <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-br from-emerald-950/30 to-gray-950 p-5 flex flex-col gap-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white truncate leading-tight">{r.song}</p>
          <p className="text-sm text-gray-400 truncate mt-0.5">{r.artist}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeColor(r.release_type)}`}>
          {(r.release_type || '?').toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">UPC</p>
          <p className="font-mono text-gray-300 text-[11px]">{r.upc || '—'}</p>
        </div>
        <div>
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Label</p>
          <p className="text-gray-300 text-[11px] truncate">{r.label || '—'}</p>
        </div>
        {r.eg_time && (
          <div>
            <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">EG Time</p>
            <p className="text-gray-300 text-[11px]">{r.eg_time}</p>
          </div>
        )}
        {r.distribution_type && (
          <div>
            <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Distribution</p>
            <p className="text-gray-300 text-[11px] truncate">{r.distribution_type}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Operations', sl: ops },
          { label: 'Motion/Edit', sl: motion },
          { label: 'YouTube', sl: yt },
        ].map(({ label, sl }) => (
          <div key={label} className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sl.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot(sl.label)}`} />
            <span>{label}: {sl.label}</span>
          </div>
        ))}
      </div>
      {r.google_drive_link && (
        <a href={r.google_drive_link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
          <Globe className="w-3 h-3" /> Google Drive <ChevronRight className="w-3 h-3 opacity-50" />
        </a>
      )}
    </div>
  );
}

// ─── Upcoming Row ─────────────────────────────────────────────────────────────

function UpcomingRow({ r, idx }: { r: UpcomingRelease; idx: number }) {
  const days = daysUntil(r.release_date);
  const urgency = days === 1 ? 'text-red-400' : days <= 3 ? 'text-orange-400' : days <= 7 ? 'text-yellow-400' : 'text-gray-500';
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-900/80 last:border-0">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black ${idx === 0 ? 'bg-blue-900/40 text-blue-300 border border-blue-800/50' : 'bg-gray-900 text-gray-500'}`}>
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{r.song}</p>
        <p className="text-xs text-gray-500 truncate">{r.artist}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-gray-400">{fmtDate(r.release_date)}</p>
        <p className={`text-[11px] font-bold ${urgency}`}>
          {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}
        </p>
      </div>
      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeColor(r.release_type)}`}>
        {(r.release_type || '?').toUpperCase()}
      </span>
    </div>
  );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, color, icon: Icon, loading }: { label: string; value: number; color: string; icon: React.ElementType; loading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800/50 bg-gray-950 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
        <Icon className={`w-3.5 h-3.5 ${color} opacity-50`} />
      </div>
      <p className={`text-2xl font-black tabular-nums ${color}`}>
        {loading ? <span className="w-8 h-6 bg-gray-800 rounded animate-pulse inline-block" /> : value.toLocaleString()}
      </p>
    </div>
  );
}

// ─── Operations Feed (WebSocket) ──────────────────────────────────────────────

function OperationsFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(buildWebSocketUrl('/api/ws/logs'));
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const raw = typeof evt.data === 'string' ? evt.data : '';
      let level: FeedEntry['level'] = 'info';
      if (raw.toLowerCase().includes('error') || raw.toLowerCase().includes('fail')) level = 'error';
      else if (raw.toLowerCase().includes('warn')) level = 'warn';
      else if (raw.toLowerCase().includes('success') || raw.toLowerCase().includes('done') || raw.toLowerCase().includes('complete')) level = 'success';
      const entry: FeedEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        level,
        message: raw.slice(0, 200),
      };
      setEntries((prev) => [entry, ...prev].slice(0, 80));
    };
    ws.onclose = () => { setConnected(false); reconnectRef.current = setTimeout(connect, 5000); };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <div className="rounded-xl border border-gray-800/50 bg-gray-950 flex flex-col h-72">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-bold text-white">Operations Feed</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {connected
            ? <><Wifi className="w-3 h-3 text-green-500" /><span className="text-[10px] text-green-500 font-semibold">LIVE</span></>
            : <><WifiOff className="w-3 h-3 text-gray-600" /><span className="text-[10px] text-gray-600 font-semibold">Reconnecting…</span></>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5 font-mono text-[11px]">
        {entries.length === 0 ? (
          <p className="text-gray-700 text-xs text-center pt-8">{connected ? 'Waiting for events…' : 'Connecting to feed…'}</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-start gap-2 py-0.5">
              {feedLevelIcon(e.level)}
              <span className="text-gray-700 shrink-0">{e.timestamp}</span>
              <span className={`${feedLevelColor(e.level)} break-all`}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Pipeline Table ───────────────────────────────────────────────────────────

function PipelineTable({ rows, loading }: { rows: SheetRelease[]; loading: boolean }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const TYPES = ['all', 'single', 'album', 'ep', 'concert'];

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== 'all') list = list.filter((r) => (r.release_type || '').toLowerCase() === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.song.toLowerCase().includes(q) || r.artist.toLowerCase().includes(q) || (r.upc || '').includes(q));
    }
    return list;
  }, [rows, filter, search]);

  return (
    <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-gray-900">
        <div className="flex items-center gap-2 shrink-0">
          <BarChart3 className="w-4 h-4 text-gray-600" />
          <h2 className="text-sm font-bold text-white">Release Pipeline</h2>
          {!loading && <span className="text-[10px] text-gray-600">({rows.length})</span>}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search song, artist, UPC…" className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-900/50 border border-gray-800 text-xs text-gray-200 placeholder-gray-700 focus:outline-none focus:border-gray-600 transition-colors" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-3.5 h-3.5 text-gray-600" />
          <div className="flex items-center gap-1">
            {TYPES.map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all ${filter === t ? 'bg-green-600/20 text-green-400 border border-green-700/40' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/40'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-900">
              {['Release', 'Type', 'Date', 'UPC', 'Ops', 'Motion', 'YT', 'Team'].map((col) => (
                <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest first:pl-5">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-900">
                  <td colSpan={8} className="px-4 py-3"><div className="h-7 bg-gray-900/60 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-700">No releases found</td></tr>
            ) : (
              filtered.map((r, i) => {
                const ops = statusLabel(r.delivery_operations || '');
                const motion = statusLabel(r.delivery_motion_editing || '');
                const yt = statusLabel(r.delivery_youtube || '');
                return (
                  <tr key={i} className="border-t border-gray-900 hover:bg-gray-900/30 transition-colors">
                    <td className="px-4 py-3 pl-5">
                      <p className="text-sm font-semibold text-white">{r.song}</p>
                      <p className="text-xs text-gray-500">{r.artist}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeColor(r.release_type)}`}>
                        {(r.release_type || '?').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{r.date || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.upc || '—'}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ops.color}`}>{ops.label}</span></td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${motion.color}`}>{motion.label}</span></td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${yt.color}`}>{yt.label}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.motion_team_member || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-900 text-xs text-gray-700 flex items-center justify-between">
          <span>Showing {filtered.length} of {rows.length} releases</span>
          {filter !== 'all' && <button onClick={() => setFilter('all')} className="text-gray-500 hover:text-gray-300 transition-colors">Clear filter ×</button>}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OperationsDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [todayReleases, setTodayReleases] = useState<SheetRelease[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingRelease[]>([]);
  const [allReleases, setAllReleases] = useState<SheetRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [statsRes, todayRes, upcomingRes, allRes] = await Promise.all([
        apiFetch('/api/dashboard/stats'),
        apiFetch('/api/dashboard/today'),
        apiFetch('/api/dashboard/upcoming?limit=7'),
        apiFetch('/api/releases/from-sheet'),
      ]);
      setStats(statsRes);
      setTodayReleases(todayRes.releases ?? []);
      setUpcoming(upcomingRes.releases ?? []);
      setAllReleases(Array.isArray(allRes) ? allRes : []);
      setLastFetched(new Date());
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => fetchAll(), 60_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="max-w-screen-xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Operations</h1>
          <p className="text-sm text-gray-500 mt-1">{todayStr}</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {lastFetched && <span className="hidden sm:block text-xs text-gray-700">Updated {lastFetched.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => fetchAll(true)} disabled={refreshing} className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 transition-all disabled:opacity-40">
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: 'Total', value: stats?.total ?? 0, color: 'text-green-400', icon: TrendingUp },
          { label: 'Singles', value: stats?.singles ?? 0, color: 'text-blue-400', icon: Music },
          { label: 'Albums', value: stats?.albums ?? 0, color: 'text-purple-400', icon: Disc3 },
          { label: 'EPs', value: stats?.eps ?? 0, color: 'text-indigo-400', icon: Layers },
          { label: 'Concerts', value: stats?.concerts ?? 0, color: 'text-orange-400', icon: Mic2 },
          { label: 'MVs', value: stats?.mv ?? 0, color: 'text-pink-400', icon: Video },
          { label: 'Lyrics', value: stats?.lyrics_videos ?? 0, color: 'text-yellow-400', icon: Zap },
          { label: 'AI', value: stats?.ai ?? 0, color: 'text-cyan-400', icon: Cpu },
        ].map((tile) => (
          <StatTile key={tile.label} {...tile} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-bold text-white">Today's Releases</h2>
            {!loading && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900">{todayReleases.length}</span>}
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-gray-900/60 animate-pulse" />)}</div>
          ) : todayReleases.length === 0 ? (
            <div className="rounded-xl border border-gray-800/30 bg-gray-950/50 py-12 text-center">
              <Calendar className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600">No releases scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-3">{todayReleases.map((r, i) => <TodayReleaseCard key={i} r={r} />)}</div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-bold text-white">Upcoming Releases</h2>
            {!loading && upcoming.length > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/50 text-blue-400 border border-blue-900">{upcoming.length}</span>}
          </div>
          <div className="rounded-xl border border-gray-800/50 bg-gray-950 px-4 py-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="py-3 border-b border-gray-900/80 last:border-0">
                  <div className="h-10 bg-gray-900/60 rounded animate-pulse" />
                </div>
              ))
            ) : upcoming.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-600">No upcoming releases</p>
            ) : (
              upcoming.map((r, i) => <UpcomingRow key={i} r={r} idx={i} />)
            )}
          </div>
        </div>
      </div>

      <OperationsFeed />

      <PipelineTable rows={allReleases} loading={loading} />
    </div>
  );
}
