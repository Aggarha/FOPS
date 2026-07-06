'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Loader2, Ban,
  Terminal, ChevronDown, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { buildWebSocketUrl, getAccessToken } from '@/lib/runtime';

// ── Types ──────────────────────────────────────────────────────────────────

interface ProtectionJob {
  job_uid:      string;
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

interface LogLine {
  id:        number;
  timestamp: string;
  level:     'info' | 'warn' | 'error' | 'debug';
  message:   string;
  replay?:   boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  'youtube-search-batch': 'YouTube Search Batch',
  'channel-scraper':      'Channel Scraper',
  'fingerprint-compare':  'Fingerprint Compare',
  'fingerprint-generate': 'Fingerprint Generate',
  'audio-match-batch':    'Audio Match Batch',
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

function StatusBadge({ status }: { status: ProtectionJob['status'] }) {
  const map: Record<string, { label: string; cls: string; spinning: boolean }> = {
    queued:    { label: 'Queued',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-600/30', spinning: false },
    running:   { label: 'Running',   cls: 'bg-blue-500/15 text-blue-400 border-blue-600/30',       spinning: true },
    completed: { label: 'Completed', cls: 'bg-green-500/15 text-green-400 border-green-600/30',    spinning: false },
    failed:    { label: 'Failed',    cls: 'bg-red-500/15 text-red-400 border-red-600/30',           spinning: false },
    cancelled: { label: 'Cancelled', cls: 'bg-neutral-500/15 text-neutral-400 border-neutral-600/30', spinning: false },
  };
  const s = map[status] ?? map.failed;
  const Icon = status === 'completed' ? CheckCircle : status === 'failed' ? XCircle : status === 'cancelled' ? Ban : status === 'running' ? Loader2 : Clock;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${s.cls}`}>
      <Icon className={`w-4 h-4 ${s.spinning ? 'animate-spin' : ''}`} />
      {s.label}
    </span>
  );
}

function levelColor(level: string) {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn':  return 'text-yellow-400';
    case 'debug': return 'text-neutral-500';
    default:      return 'text-neutral-300';
  }
}

function levelBg(level: string) {
  switch (level) {
    case 'error': return 'bg-red-950/20';
    case 'warn':  return 'bg-yellow-950/20';
    default:      return '';
  }
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const params = useParams();
  const jobId  = params.jobId as string;
  const router = useRouter();

  const [job,      setJob]      = useState<ProtectionJob | null>(null);
  const [logs,     setLogs]     = useState<LogLine[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showResult, setShowResult] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const wsRef      = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const seenIds    = useRef(new Set<number>());

  // Fetch job once on mount
  const fetchJob = useCallback(async () => {
    try {
      const data = await apiFetch<{ job: ProtectionJob }>(`/api/protection/jobs/${jobId}`);
      setJob(data.job);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // WebSocket live log connection
  useEffect(() => {
    if (!jobId) return;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const token = getAccessToken();
      const wsUrl = `${buildWebSocketUrl(`/api/ws/jobs/${jobId}`)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setWsStatus('connecting');

      ws.onopen = () => setWsStatus('connected');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'job_log' && msg.id !== undefined) {
            if (!seenIds.current.has(msg.id)) {
              seenIds.current.add(msg.id);
              setLogs(prev => [...prev, {
                id:        msg.id,
                timestamp: msg.ts ?? new Date().toISOString(),
                level:     msg.level ?? 'info',
                message:   msg.message ?? '',
                replay:    msg.replay ?? false,
              }]);
            }
          } else if (msg.type === 'job_status') {
            setJob(prev => prev ? { ...prev, status: msg.status, progress: msg.progress ?? prev.progress } : prev);
            if (msg.status === 'completed' || msg.status === 'failed') {
              // Refresh full job details once terminal state reached
              setTimeout(() => fetchJob(), 500);
            }
          } else if (msg.type === 'job_progress') {
            setJob(prev => prev ? { ...prev, progress: msg.progress ?? prev.progress, current_step: msg.step || prev.current_step } : prev);
          } else if (msg.type === 'pong') {
            // keep alive acknowledged
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = (e) => {
        setWsStatus('disconnected');
        wsRef.current = null;
        // Auto-reconnect for queued/running jobs
        if (e.code !== 4401 && e.code !== 4403) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => setWsStatus('disconnected');
    }

    connect();

    // Send pings every 20s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [jobId, fetchJob]);

  async function cancelJob() {
    try {
      await apiFetch(`/api/protection/jobs/${jobId}/cancel`, { method: 'POST' });
      fetchJob();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6">
        <Link href="/tools/protection/jobs" className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Link>
        <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-700/40 rounded-xl text-red-400">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      </div>
    );
  }

  const isTerminal = job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled');

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/tools/protection/jobs" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </Link>

      {/* Job header */}
      {job && (
        <div className="bg-neutral-900 border border-neutral-700/50 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-lg font-bold">{toolLabel(job.tool_name)}</h1>
                <StatusBadge status={job.status} />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  wsStatus === 'connected'    ? 'bg-green-500/15 text-green-400' :
                  wsStatus === 'connecting'   ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-neutral-700/30 text-neutral-500'
                }`}>
                  {wsStatus === 'connected' ? '● Live' : wsStatus === 'connecting' ? '◌ Connecting' : '○ Disconnected'}
                </span>
              </div>
              <div className="text-xs text-neutral-500 font-mono">{job.job_uid}</div>
              {job.current_step && (
                <div className="text-sm text-neutral-400 mt-1">{job.current_step}</div>
              )}
            </div>
            {(job.status === 'queued' || job.status === 'running') && (
              <button
                onClick={cancelJob}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-red-700/40 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
              >
                <Ban className="w-4 h-4" />
                Cancel Job
              </button>
            )}
            {isTerminal && (
              <button
                onClick={fetchJob}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Refresh
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
              <span>Progress</span>
              <span>{Math.round(job.progress)}%</span>
            </div>
            <div className="w-full bg-neutral-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  job.status === 'completed' ? 'bg-green-500' :
                  job.status === 'failed'    ? 'bg-red-500'   :
                  job.status === 'cancelled' ? 'bg-neutral-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
              />
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex gap-6 mt-3 text-xs text-neutral-500">
            {job.created_at && <span>Created: {new Date(job.created_at).toLocaleString()}</span>}
            {job.started_at && <span>Started: {new Date(job.started_at).toLocaleString()}</span>}
            {job.completed_at && <span>Finished: {new Date(job.completed_at).toLocaleString()}</span>}
          </div>
        </div>
      )}

      {/* Error panel */}
      {job?.error && (
        <div className="mb-5 p-4 bg-red-900/20 border border-red-700/40 rounded-xl">
          <div className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-2">
            <XCircle className="w-4 h-4" /> Job Error
          </div>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
            {typeof job.error === 'string' ? job.error : JSON.stringify(job.error, null, 2)}
          </pre>
        </div>
      )}

      {/* Result panel (collapsible) */}
      {job?.result && (
        <div className="mb-5 bg-neutral-900 border border-neutral-700/50 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowResult(v => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-neutral-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-green-400">
              <CheckCircle className="w-4 h-4" />
              Job Result
            </div>
            <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${showResult ? 'rotate-180' : ''}`} />
          </button>
          {showResult && (
            <div className="px-4 pb-4">
              <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono max-h-96 overflow-auto bg-neutral-950 p-3 rounded-lg border border-neutral-700/40">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Live logs */}
      <div className="bg-neutral-900 border border-neutral-700/50 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/40">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="w-4 h-4 text-neutral-400" />
            Live Logs
            <span className="text-xs text-neutral-500">({logs.length} lines)</span>
          </div>
          {wsStatus === 'connected' && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </div>
          )}
        </div>
        <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-neutral-600">
              {wsStatus === 'connecting' ? 'Connecting to log stream…' : 'No log lines yet.'}
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {logs.map(line => (
                <div
                  key={line.id}
                  className={`flex gap-3 px-4 py-1.5 hover:bg-neutral-800/30 transition-colors ${levelBg(line.level)}`}
                >
                  <span className="text-neutral-600 flex-shrink-0 w-20 text-right">{formatTs(line.timestamp)}</span>
                  <span className={`uppercase flex-shrink-0 w-10 font-bold ${levelColor(line.level)}`}>{line.level}</span>
                  <span className={`flex-1 whitespace-pre-wrap break-words ${levelColor(line.level)}`}>{line.message}</span>
                </div>
              ))}
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
