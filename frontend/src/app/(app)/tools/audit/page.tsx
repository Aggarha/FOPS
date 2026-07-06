'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, RefreshCw, Filter, Search, ChevronLeft,
  ChevronRight, AlertCircle, CheckCircle, Info, Zap, Clock,
} from 'lucide-react';
import { fetchAuditLogs } from '@/lib/api';
import type { AuditLog } from '@/lib/api';

const LEVEL_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  INFO:    { color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  WARNING: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  ERROR:   { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  SUCCESS: { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
  DEBUG:   { color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30' },
};

const CATEGORY_ICONS: Record<string, any> = {
  TOOL: Zap,
  SYSTEM: Info,
  AUTH: AlertCircle,
  PIPELINE: Clock,
  AGENT: CheckCircle,
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const PAGE_SIZE = 25;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hoursFilter, setHoursFilter] = useState(24);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditLogs({
        level: levelFilter || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        hours: hoursFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, categoryFilter, statusFilter, hoursFilter, page]);

  useEffect(() => { setPage(0); }, [levelFilter, categoryFilter, statusFilter, hoursFilter]);
  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? logs.filter(l =>
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        (l.message || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.tool_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.api_route || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ClipboardList className="w-8 h-8 text-teal-400" />
            <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
          </div>
          <p className="text-gray-400">Complete activity trail — {total.toLocaleString()} total records</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-all text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
        <div className="flex items-center gap-2 text-gray-400">
          <Filter className="w-4 h-4" />
          <span className="text-sm">Filters:</span>
        </div>

        {/* Time range */}
        <select
          value={hoursFilter}
          onChange={e => setHoursFilter(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value={1}>Last 1h</option>
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 3d</option>
          <option value={168}>Last 7d</option>
          <option value={0}>All time</option>
        </select>

        {/* Level */}
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value="">All levels</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DEBUG">DEBUG</option>
        </select>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value="">All categories</option>
          <option value="TOOL">TOOL</option>
          <option value="SYSTEM">SYSTEM</option>
          <option value="AUTH">AUTH</option>
          <option value="PIPELINE">PIPELINE</option>
          <option value="AGENT">AGENT</option>
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm"
        >
          <option value="">All statuses</option>
          <option value="success">success</option>
          <option value="error">error</option>
          <option value="pending">pending</option>
        </select>

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="bg-transparent text-white text-sm outline-none w-full placeholder-gray-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-700/50 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-0 px-4 py-3 bg-gray-800/80 border-b border-gray-700/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <div className="col-span-2">Time</div>
          <div className="col-span-1">Level</div>
          <div className="col-span-1">Category</div>
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Tool / Route</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Duration</div>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-700/30">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 px-4 flex items-center gap-4 animate-pulse">
                <div className="h-3 w-32 bg-gray-700 rounded" />
                <div className="h-3 w-14 bg-gray-700 rounded" />
                <div className="h-3 w-20 bg-gray-700 rounded" />
                <div className="h-3 flex-1 bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="w-12 h-12 text-gray-700 mb-3" />
            <p className="text-gray-400">No logs found</p>
            <p className="text-gray-600 text-sm mt-1">Try adjusting the filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/20">
            {filtered.map(log => {
              const lvl = LEVEL_CONFIG[log.level?.toUpperCase()] || LEVEL_CONFIG.INFO;
              const CatIcon = CATEGORY_ICONS[log.category?.toUpperCase()] || Info;
              const isExp = expanded === log.id;
              return (
                <div
                  key={log.id}
                  className={`transition-all ${isExp ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'}`}
                >
                  <button
                    className="w-full grid grid-cols-12 gap-0 px-4 py-3 text-left"
                    onClick={() => setExpanded(isExp ? null : log.id)}
                  >
                    <div className="col-span-2 text-xs text-gray-400 font-mono">
                      {fmt(log.timestamp)}
                    </div>
                    <div className="col-span-1">
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${lvl.bg} ${lvl.color} font-medium`}>
                        {log.level}
                      </span>
                    </div>
                    <div className="col-span-1 flex items-center gap-1 text-xs text-gray-400">
                      <CatIcon className="w-3 h-3" />
                      <span className="truncate">{log.category}</span>
                    </div>
                    <div className="col-span-4 text-sm text-white truncate pr-2">{log.title}</div>
                    <div className="col-span-2 text-xs text-gray-500 truncate pr-2">
                      {log.tool_name || log.api_route || '—'}
                    </div>
                    <div className="col-span-1 text-xs">
                      {log.status ? (
                        <span className={`${log.status === 'success' ? 'text-green-400' : log.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                          {log.status}
                        </span>
                      ) : '—'}
                    </div>
                    <div className="col-span-1 text-xs text-gray-500">
                      {log.duration_ms !== undefined && log.duration_ms !== null ? `${log.duration_ms}ms` : '—'}
                    </div>
                  </button>
                  {isExp && log.message && (
                    <div className="px-4 pb-3 pt-0">
                      <pre className="text-xs text-gray-400 bg-gray-900/50 rounded-lg p-3 whitespace-pre-wrap break-words">
                        {log.message}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages} ({total.toLocaleString()} records)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-9 h-9 rounded-lg text-sm transition-all ${
                    pg === page
                      ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {pg + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
