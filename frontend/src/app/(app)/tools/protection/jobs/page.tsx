'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Briefcase, RefreshCw, CheckCircle, XCircle, Clock, Loader2,
  ChevronRight, Filter, AlertTriangle, Ban, Play,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface ProtectionJob {
  job_uid:      string;
  tenant_id:    string;
  user_id:      number;
  tool_name:    string;
  status:       'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress:     number;
  current_step: string | null;
  result:       unknown;
  error:        unknown;
  created_at:   string;
  started_at:   string | null;
  completed_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  'youtube-search-batch': 'YT Search Batch',
  'channel-scraper':      'Channel Scraper',
  'fingerprint-compare':  'Fingerprint Compare',
  'fingerprint-generate': 'Fingerprint Generate',
  'audio-match-batch':    'Audio Match Batch',
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

function StatusBadge({ status }: { status: ProtectionJob['status'] }) {
  const map: Record<string, { label: string; cls: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }> = {
    queued:    { label: 'Queued',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-600/30', Icon: Clock },
    running:   { label: 'Running',   cls: 'bg-blue-500/15 text-blue-400 border-blue-600/30',       Icon: Loader2 },
    completed: { label: 'Done',      cls: 'bg-green-500/15 text-green-400 border-green-600/30',    Icon: CheckCircle },
    failed:    { label: 'Failed',    cls: 'bg-red-500/15 text-red-400 border-red-600/30',           Icon: XCircle },
    cancelled: { label: 'Cancelled', cls: 'bg-neutral-500/15 text-neutral-400 border-neutral-600/30', Icon: Ban },
  };
  const { label, cls, Icon } = map[status] ?? map.failed;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const color =
    status === 'completed' ? 'bg-green-500' :
    status === 'failed'    ? 'bg-red-500'   :
    status === 'cancelled' ? 'bg-neutral-500' :
    'bg-blue-500';
  return (
    <div className="w-full bg-neutral-700 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function elapsed(started: string | null, completed: string | null): string {
  if (!started) return '—';
  const endMs  = completed ? new Date(completed).getTime() : Date.now();
  const secs   = Math.round((endMs - new Date(started).getTime()) / 1000);
  if (secs < 60)  return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const STATUS_FILTERS = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProtectionJobsPage() {
  const [jobs,      setJobs]      = useState<ProtectionJob[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh]   = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await apiFetch<{ jobs: ProtectionJob[] }>(`/api/protection/jobs${qs}`);
      setJobs(data.jobs ?? []);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Initial load + poll while any job is active
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
      if (hasActive) fetchJobs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, jobs, fetchJobs]);

  async function cancelJob(uid: string) {
    try {
      await apiFetch(`/api/protection/jobs/${uid}/cancel`, { method: 'POST' });
      fetchJobs();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30">
            <Briefcase className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Protection Jobs</h1>
            <p className="text-sm text-neutral-400">Track all background tool jobs for your account</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh
                ? 'border-green-600/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'border-neutral-600 bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Play className="w-3 h-3" />
            {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
          </button>
          <button
            onClick={fetchJobs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors border ${
              statusFilter === s
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            {s === 'all' ? 'All' : s}
            {s !== 'all' && (
              <span className="ml-1 opacity-60">
                ({jobs.filter(j => j.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/40 rounded-lg text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && jobs.length === 0 && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-neutral-800/50 rounded-xl animate-pulse border border-neutral-700/40" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && !error && (
        <div className="text-center py-20 text-neutral-500">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No jobs found{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.</p>
          <p className="text-xs mt-1">Run a batch tool to see jobs here.</p>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map(job => (
            <div
              key={job.job_uid}
              className="bg-neutral-900 border border-neutral-700/50 rounded-xl p-4 hover:border-neutral-600/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{toolLabel(job.tool_name)}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="text-xs text-neutral-500 font-mono truncate">{job.job_uid}</div>
                  {job.current_step && (
                    <div className="text-xs text-neutral-400 mt-1 truncate">{job.current_step}</div>
                  )}
                  <div className="mt-2">
                    <ProgressBar value={job.progress} status={job.status} />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-neutral-500">{Math.round(job.progress)}%</span>
                      <span className="text-xs text-neutral-500">
                        {elapsed(job.started_at, job.completed_at)}
                        {job.started_at && !job.completed_at && ' elapsed'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(job.status === 'queued' || job.status === 'running') && (
                    <button
                      onClick={() => cancelJob(job.job_uid)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-red-700/40 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
                    >
                      <Ban className="w-3 h-3" />
                      Cancel
                    </button>
                  )}
                  <Link
                    href={`/tools/protection/jobs/${job.job_uid}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    View
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
