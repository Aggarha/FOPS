'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell, BellOff, CheckCheck, Trash2, RefreshCw,
  Info, AlertTriangle, CheckCircle, XCircle, Filter,
} from 'lucide-react';
import {
  fetchNotifications, markNotificationsAsRead,
  markNotificationRead, deleteNotification,
} from '@/lib/api';
import type { Notification } from '@/lib/api';

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; badge: string }> = {
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   badge: 'bg-blue-500/20 text-blue-300' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', badge: 'bg-yellow-500/20 text-yellow-300' },
  success: { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  badge: 'bg-green-500/20 text-green-300' },
  danger:  { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    badge: 'bg-red-500/20 text-red-300' },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'info' | 'warning' | 'success' | 'danger'>('all');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchNotifications();
      setNotifications((data.notifications as any[]).reverse());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const handleMarkRead = async (id: number) => {
    setActionLoading(id);
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {} finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: number) => {
    setActionLoading(id);
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {} finally {
      setActionLoading(null);
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;
  const counts = { info: 0, warning: 0, success: 0, danger: 0 } as Record<string, number>;
  notifications.forEach(n => { if (counts[n.type] !== undefined) counts[n.type]++; });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Bell className="w-8 h-8 text-orange-400" />
            <h1 className="text-3xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-sm font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-gray-400">System alerts, events, and activity updates</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-all text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all text-sm"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { key: 'all', label: 'All', count: notifications.length, color: 'text-white', bg: 'bg-gray-700/50', border: 'border-gray-600/50' },
          { key: 'info', label: 'Info', count: counts.info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
          { key: 'success', label: 'Success', count: counts.success, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
          { key: 'warning', label: 'Warning', count: counts.warning, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
          { key: 'danger', label: 'Danger', count: counts.danger, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
        ].map(({ key, label, count, color, bg, border }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`px-3 py-3 rounded-xl border transition-all text-left ${
              filter === key
                ? `${bg} ${border} ring-1 ring-offset-0 ring-current ${color}`
                : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:border-gray-600'
            }`}
          >
            <div className={`text-2xl font-bold ${color}`}>{count}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-1">
        <Filter className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-500">
          Showing {filtered.length} of {notifications.length} notifications
        </span>
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="text-xs text-gray-500 hover:text-gray-300 underline ml-2"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Content */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-xl bg-gray-800/50 border border-gray-700/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BellOff className="w-16 h-16 text-gray-700 mb-4" />
          <p className="text-gray-400 text-lg">No notifications</p>
          <p className="text-gray-600 text-sm mt-1">
            {filter !== 'all' ? 'Try a different filter' : "You're all caught up"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
            const Icon = cfg.icon;
            const busy = actionLoading === n.id;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                  n.read
                    ? 'bg-gray-800/30 border-gray-700/30 opacity-60'
                    : `${cfg.bg} ${cfg.border}`
                }`}
              >
                <div className={`mt-0.5 p-1.5 rounded-lg ${n.read ? 'bg-gray-700/50' : cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {n.type}
                    </span>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                    )}
                    <span className="text-xs text-gray-500 ml-auto">{timeAgo(n.timestamp)}</span>
                  </div>
                  <p className={`text-sm font-medium ${n.read ? 'text-gray-400' : 'text-white'}`}>
                    {(n as any).title || n.message}
                  </p>
                  {(n as any).title && n.message && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-green-500/10 transition-all"
                      title="Mark as read"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
