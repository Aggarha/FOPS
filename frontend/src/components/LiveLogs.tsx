'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAuditLogs, type AuditLog } from '@/lib/api';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: string;
  action: string;
  details: string;
}

export function LiveLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const normalizeLevel = (level: string): LogEntry['level'] => {
      const normalized = level.toLowerCase();
      if (normalized === 'warning') return 'warn';
      if (normalized === 'critical') return 'error';
      if (['info', 'warn', 'error', 'success'].includes(normalized)) {
        return normalized as LogEntry['level'];
      }
      return 'info';
    };

    const toLogEntry = (entry: AuditLog): LogEntry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      level: normalizeLevel(entry.level),
      category: entry.category || 'system',
      action: entry.title,
      details: entry.message || entry.api_route || entry.tool_name || entry.status || 'No additional details',
    });

    const loadLogs = async () => {
      try {
        const data = await fetchAuditLogs({ limit: 100, hours: 24 });
        if (!cancelled) {
          setLogs(data.logs.map(toLogEntry));
        }
      } catch (error) {
        if (!cancelled) {
          setLogs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadLogs();
    const interval = setInterval(loadLogs, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = logs.filter((log) => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (filterCategory && log.category !== filterCategory) return false;
    return true;
  });

  const categories = Array.from(new Set(logs.map((log) => log.category))).sort();

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-400 bg-green-950/30';
      case 'error':
        return 'text-red-400 bg-red-950/30';
      case 'warn':
        return 'text-yellow-400 bg-yellow-950/30';
      default:
        return 'text-blue-400 bg-blue-950/30';
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Level</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-900 border border-green-500/30 rounded px-3 py-2 text-sm text-green-400 focus:outline-none"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Category</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-gray-900 border border-green-500/30 rounded px-3 py-2 text-sm text-green-400 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 flex items-end">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs text-green-400">Live Streaming</span>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={scrollRef}
        className="bg-black border border-green-500/30 rounded-lg h-96 overflow-y-auto font-mono text-xs space-y-1 p-4"
      >
        {loading ? (
          <div className="text-gray-600 py-4 text-center">Loading logs...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-600 py-4 text-center">No logs match filter</div>
        ) : (
          filtered.map((log) => (
            <div key={log.id} className={`${getLevelColor(log.level)} px-2 py-1 rounded flex gap-3`}>
              <span className="text-gray-500 min-w-[12ch]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="min-w-[8ch] font-bold uppercase">[{log.level}]</span>
              <span className="text-gray-300 min-w-[20ch] uppercase">{log.category}</span>
              <span className="flex-1">{log.action}</span>
              <span className="text-gray-600">{log.details}</span>
            </div>
          ))
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {['info', 'success', 'warn', 'error'].map((level) => (
          <div
            key={level}
            className="bg-gray-900/50 border border-green-500/30 rounded p-2 text-center"
          >
            <p className="text-gray-500 uppercase">{level}</p>
            <p className="text-green-400 font-bold text-lg">
              {logs.filter((l) => l.level === level).length}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
