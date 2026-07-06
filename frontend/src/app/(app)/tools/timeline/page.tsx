'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, RefreshCw, Search, Filter, Music, Disc3,
  CheckCircle2, Clock, AlertCircle, ExternalLink, LayoutGrid, List,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { fetchReleases, updateRelease } from '@/lib/api';
import type { Release } from '@/lib/api';

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: any }> = {
  pending:    { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: Clock },
  processing: { color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   icon: AlertCircle },
  done:       { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  icon: CheckCircle2 },
};

const TYPE_COLORS: Record<string, string> = {
  single:  'from-purple-500 to-pink-500',
  album:   'from-blue-500 to-cyan-500',
  ep:      'from-orange-500 to-red-500',
  concert: 'from-green-500 to-teal-500',
};

function groupByMonth(releases: Release[]) {
  const groups: Record<string, Release[]> = {};
  for (const r of releases) {
    const key = r.release_date
      ? r.release_date.slice(0, 7)  // YYYY-MM
      : 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, items]) => ({ month, items }));
}

function formatMonth(m: string) {
  if (m === 'Unknown') return 'No Date';
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function ReleasePill({ release, onStatusChange }: { release: Release; onStatusChange: (id: number, s: string) => void }) {
  const scfg = STATUS_CONFIG[release.status] || STATUS_CONFIG.pending;
  const StatusIcon = scfg.icon;
  const typeGradient = TYPE_COLORS[release.release_type] || 'from-gray-500 to-gray-600';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${scfg.bg} ${scfg.border} transition-all hover:border-opacity-60 group`}>
      {/* Type dot */}
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${typeGradient} flex items-center justify-center flex-shrink-0`}>
        {release.release_type === 'album' || release.release_type === 'ep'
          ? <Disc3 className="w-4 h-4 text-white" />
          : <Music className="w-4 h-4 text-white" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold text-white truncate">{release.song_title}</span>
          <span className="text-xs text-gray-500 truncate flex-shrink-0">— {release.artist_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded ${scfg.bg} ${scfg.color} flex items-center gap-1`}>
            <StatusIcon className="w-2.5 h-2.5" />
            {release.status}
          </span>
          <span className="text-xs text-gray-600 uppercase">{release.release_type}</span>
          {release.release_date && (
            <span className="text-xs text-gray-500">{release.release_date}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {release.youtube_link && (
          <a
            href={release.youtube_link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Open on YouTube"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <select
          value={release.status}
          onChange={e => onStatusChange(release.id, e.target.value)}
          onClick={e => e.stopPropagation()}
          className="text-xs bg-gray-900 border border-gray-600 text-gray-300 rounded-lg px-1.5 py-1"
        >
          <option value="pending">pending</option>
          <option value="processing">processing</option>
          <option value="done">done</option>
        </select>
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<'timeline' | 'grid'>('timeline');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchReleases();
      setReleases(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateRelease(id, { status });
      setReleases(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {}
  };

  const filtered = releases.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      r.song_title.toLowerCase().includes(q) ||
      r.artist_name.toLowerCase().includes(q) ||
      (r.upc || '').includes(q);
    const matchType = !typeFilter || r.release_type === typeFilter;
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const groups = groupByMonth(filtered);

  const stats = {
    total: releases.length,
    pending: releases.filter(r => r.status === 'pending').length,
    processing: releases.filter(r => r.status === 'processing').length,
    done: releases.filter(r => r.status === 'done').length,
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Calendar className="w-8 h-8 text-sky-400" />
            <h1 className="text-3xl font-bold text-white">Release Timeline</h1>
          </div>
          <p className="text-gray-400">Track and manage all releases by date</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(v => v === 'timeline' ? 'grid' : 'timeline')}
            className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-all"
            title="Toggle view"
          >
            {view === 'timeline' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-all text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white', bg: 'bg-gray-700/50', border: 'border-gray-600/50' },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
          { label: 'Processing', value: stats.processing, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
          { label: 'Done', value: stats.done, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`px-4 py-3 rounded-xl border ${bg} ${border}`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search artist, title, UPC..."
            className="bg-transparent text-white text-sm outline-none w-full placeholder-gray-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value="">All types</option>
          <option value="single">Single</option>
          <option value="album">Album</option>
          <option value="ep">EP</option>
          <option value="concert">Concert</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="done">Done</option>
        </select>
        <span className="text-xs text-gray-500 self-center ml-auto">{filtered.length} releases</span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i}>
              <div className="h-5 w-36 bg-gray-700 rounded mb-3 animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3].map(j => (
                  <div key={j} className="h-16 rounded-xl bg-gray-800/50 border border-gray-700/30 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="w-16 h-16 text-gray-700 mb-4" />
          <p className="text-gray-400">No releases found</p>
        </div>
      ) : view === 'timeline' ? (
        <div className="space-y-8">
          {groups.map(({ month, items }) => (
            <div key={month} className="relative">
              {/* Month marker */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-sm font-semibold text-sky-300">{formatMonth(month)}</span>
                  <span className="text-xs text-sky-500 ml-1">{items.length}</span>
                </div>
                <div className="flex-1 h-px bg-gray-700/50" />
              </div>
              {/* Releases for this month */}
              <div className="space-y-2 ml-4 border-l border-gray-700/40 pl-4">
                {items
                  .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
                  .map(r => (
                    <div key={r.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-gray-600 bg-gray-900" />
                      <ReleasePill release={r} onStatusChange={handleStatusChange} />
                    </div>
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered
            .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
            .map(r => (
              <ReleasePill key={r.id} release={r} onStatusChange={handleStatusChange} />
            ))
          }
        </div>
      )}
    </div>
  );
}
