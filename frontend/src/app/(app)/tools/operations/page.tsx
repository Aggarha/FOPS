'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Square, Trash2, RefreshCw, CheckCircle2,
  XCircle, Clock, Loader2, AlertCircle, ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JobProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
}

interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: JobProgress;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface JobStats {
  running: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const STAGE_ORDER: Record<string, string[]> = {
  'youtube-search':    ['pending', 'searching', 'processing', 'scoring', 'done'],
  'audio-match':       ['pending', 'preparing', 'fingerprinting', 'matching', 'done'],
  'channel-scrape':    ['pending', 'connecting', 'scraping', 'processing', 'done'],
  'fingerprint-check': ['pending', 'preparing', 'fingerprinting', 'done'],
  'run-pipeline':      ['pending', 'fetching', 'processing', 'uploading', 'done'],
  default:             ['pending', 'running', 'processing', 'done'],
};

const STATUS_CONFIG = {
  pending:   { color: 'text-gray-400',   bg: 'bg-gray-800/30',   border: 'border-gray-700',   icon: Clock,        label: 'Pending' },
  running:   { color: 'text-blue-400',   bg: 'bg-blue-950/30',   border: 'border-blue-800',   icon: Loader2,      label: 'Running' },
  completed: { color: 'text-green-400',  bg: 'bg-green-950/20',  border: 'border-green-900',  icon: CheckCircle2, label: 'Completed' },
  failed:    { color: 'text-red-400',    bg: 'bg-red-950/20',    border: 'border-red-900',    icon: XCircle,      label: 'Failed' },
  cancelled: { color: 'text-yellow-400', bg: 'bg-yellow-950/20', border: 'border-yellow-900', icon: AlertCircle,  label: 'Cancelled' },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  'youtube-search': 'YouTube Search', 'audio-match': 'Audio Match',
  'channel-scrape': 'Channel Scrape', 'fingerprint-check': 'Fingerprint Check',
  'run-pipeline': 'Run Pipeline', 'batch-pipeline': 'Batch Pipeline',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function elapsed(start: string | null, end: string | null): string {
  if (!start) return '—';
  const ms = (end ? new Date(end + 'Z').getTime() : Date.now()) - new Date(start + 'Z').getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function etaStr(job: Job): string | null {
  if (job.status !== 'running' || !job.started_at) return null;
  const pct = job.progress.percentage;
  if (pct <= 0 || pct >= 100) return null;
  const elapsedMs = Date.now() - new Date(job.started_at + 'Z').getTime();
  const remaining = (elapsedMs / pct) * 100 - elapsedMs;
  if (remaining < 1000) return 'finishing…';
  if (remaining < 60000) return `~${Math.ceil(remaining / 1000)}s left`;
  return `~${Math.ceil(remaining / 60000)}m left`;
}

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Stage Dots ─────────────────────────────────────────────────────────────────

function StageDots({ job }: { job: Job }) {
  const stages = STAGE_ORDER[job.type] ?? STAGE_ORDER.default;
  const currentIdx = stages.indexOf(job.progress.stage);
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => {
        const done   = job.status === 'completed' || i < currentIdx;
        const active = i === currentIdx && job.status === 'running';
        const failed = job.status === 'failed' && i === currentIdx;
        return (
          <React.Fragment key={s}>
            <div title={s} className={`w-2 h-2 rounded-full transition-all ${
              failed ? 'bg-red-500' : done ? 'bg-green-500' :
              active ? 'bg-blue-400 animate-pulse ring-2 ring-blue-400/30' : 'bg-gray-700'
            }`} />
            {i < stages.length - 1 && <div className={`w-4 h-px ${done ? 'bg-green-700' : 'bg-gray-800'}`} />}
          </React.Fragment>
        );
      })}
      <span className="ml-2 text-[10px] text-gray-600 font-mono">{job.progress.stage}</span>
    </div>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct, status }: { pct: number; status: Job['status'] }) {
  const color = status === 'completed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' :
    status === 'cancelled' ? 'bg-yellow-600' : 'bg-blue-500';
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ─── Job Card ───────────────────────────────────────────────────────────────────

function JobCard({ job, onCancel, onDelete, onExpand, expanded }:
  { job: Job; onCancel: (id: string) => void; onDelete: (id: string) => void; onExpand: (id: string) => void; expanded: boolean }) {
  const cfg = STATUS_CONFIG[job.status];
  const StatusIcon = cfg.icon;
  const eta = etaStr(job);

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden transition-all`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <StatusIcon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color} ${job.status === 'running' ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{JOB_TYPE_LABELS[job.type] ?? job.type}</span>
            <span className="font-mono text-[10px] text-gray-600">{job.id.slice(0, 8)}</span>
            {job.params?.song && (
              <span className="text-xs text-gray-500 truncate max-w-xs">
                {String(job.params.artist ?? '')} — {String(job.params.song ?? '')}
              </span>
            )}
            {job.params?.channel_url && (
              <span className="text-xs text-gray-500 truncate max-w-xs">{String(job.params.channel_url)}</span>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            <StageDots job={job} />
            <div className="flex items-center gap-2">
              <ProgressBar pct={job.progress.percentage} status={job.status} />
              <span className={`shrink-0 text-xs font-mono font-bold ${cfg.color}`}>{job.progress.percentage.toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-700 flex-wrap">
            <span>Created {fmtTime(job.created_at)}</span>
            {job.started_at && <span>Started {fmtTime(job.started_at)}</span>}
            <span>Elapsed {elapsed(job.started_at, job.completed_at)}</span>
            {eta && <span className="text-blue-500 font-semibold">{eta}</span>}
            {job.progress.current > 0 && job.progress.total > 0 && (
              <span>{job.progress.current}/{job.progress.total} items</span>
            )}
          </div>
          {job.progress.message && <p className="text-[10px] text-gray-600 mt-1 font-mono truncate">{job.progress.message}</p>}
          {job.error && <p className="text-[10px] text-red-500 mt-1 font-mono truncate">{job.error}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {job.status === 'running' && (
            <button onClick={() => onCancel(job.id)} title="Cancel" className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/20 transition-all">
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          {['completed', 'failed', 'cancelled'].includes(job.status) && (
            <button onClick={() => onDelete(job.id)} title="Remove" className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {(job.result || job.error) && (
            <button onClick={() => onExpand(job.id)} className="p-1.5 rounded-lg text-gray-700 hover:text-gray-400 transition-all">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {expanded && (job.result || job.error) && (
        <div className="border-t border-gray-800/50 px-4 py-3">
          <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {job.error ? `ERROR:\n${job.error}` : JSON.stringify(job.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────────

function StatsBar({ stats, total }: { stats: JobStats; total: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {([
        { label: 'Total',     value: total,           color: 'text-white' },
        { label: 'Running',   value: stats.running,   color: 'text-blue-400' },
        { label: 'Pending',   value: stats.pending,   color: 'text-gray-400' },
        { label: 'Completed', value: stats.completed, color: 'text-green-400' },
        { label: 'Failed',    value: stats.failed,    color: 'text-red-400' },
        { label: 'Cancelled', value: stats.cancelled, color: 'text-yellow-400' },
      ] as const).map(({ label, value, color }) => (
        <div key={label} className="rounded-xl border border-gray-800/50 bg-gray-950 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
          <p className={`text-2xl font-black mt-0.5 tabular-nums ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'running' | 'pending' | 'completed' | 'failed';

export default function OperationsPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [stats, setStats]       = useState<JobStats>({ running: 0, pending: 0, completed: 0, failed: 0, cancelled: 0 });
  const [total, setTotal]       = useState(0);
  const [filter, setFilter]     = useState<FilterTab>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);
  const [clearing, setClearing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const qs = filter !== 'all' ? `?status=${filter}` : '';
      const data = await apiFetch(`/api/jobs${qs}`);
      setJobs(data.jobs ?? []);
      setStats(data.stats ?? { running: 0, pending: 0, completed: 0, failed: 0, cancelled: 0 });
      setTotal(data.total ?? 0);
      setLastRefresh(new Date());
    } catch { /* ignore auth errors */ }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    fetchJobs();
    const hasActive = stats.running > 0 || stats.pending > 0;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchJobs, hasActive ? 2000 : 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchJobs, stats.running, stats.pending]);

  const cancelJob = async (id: string) => {
    await apiFetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
    fetchJobs();
  };

  const deleteJob = async (id: string) => {
    await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' });
    setJobs((p) => p.filter((j) => j.id !== id));
  };

  const clearFinished = async () => {
    setClearing(true);
    await apiFetch('/api/jobs', { method: 'DELETE' });
    await fetchJobs();
    setClearing(false);
  };

  const toggleExpand = (id: string) =>
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',       label: 'All',       count: total },
    { id: 'running',   label: 'Running',   count: stats.running },
    { id: 'pending',   label: 'Pending',   count: stats.pending },
    { id: 'completed', label: 'Completed', count: stats.completed },
    { id: 'failed',    label: 'Failed',    count: stats.failed },
  ];

  const hasFinished = stats.completed + stats.failed + stats.cancelled > 0;

  return (
    <div className="max-w-screen-lg space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Job Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time job queue — progress tracking, stages &amp; ETA</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-gray-700">
              Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={fetchJobs} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {hasFinished && (
            <button onClick={clearFinished} disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/40 border border-gray-700 hover:border-red-900 text-xs font-semibold text-gray-500 hover:text-red-400 transition-all disabled:opacity-40">
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear Finished
            </button>
          )}
        </div>
      </div>

      <StatsBar stats={stats} total={total} />

      <div className="flex gap-1 border-b border-gray-800/50">
        {TABS.map(({ id, label, count }) => (
          <button key={id} onClick={() => { setFilter(id); setLoading(true); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
              filter === id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {label}
            {count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filter === id ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-500'
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-gray-800/30 bg-gray-950/30 text-center">
          <Activity className="w-10 h-10 text-gray-800 mb-4" />
          <p className="text-gray-600 text-sm font-medium">
            {filter === 'all' ? 'No jobs in the queue' : `No ${filter} jobs`}
          </p>
          <p className="text-gray-700 text-xs mt-1">Jobs appear here when tools like Audio Match, YouTube Search, or Pipeline are run</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onCancel={cancelJob} onDelete={deleteJob} onExpand={toggleExpand} expanded={expanded.has(job.id)} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-800/30 bg-gray-950/50 p-4">
        <p className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-3">Stage legend</p>
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Not started', cls: 'bg-gray-700' },
            { label: 'Active',      cls: 'bg-blue-400' },
            { label: 'Done',        cls: 'bg-green-500' },
            { label: 'Failed',      cls: 'bg-red-500' },
          ].map(({ label, cls }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
