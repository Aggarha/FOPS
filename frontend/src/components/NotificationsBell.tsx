'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import {
  deleteNotification,
  fetchNotifications,
  markNotificationsAsRead,
} from '@/lib/api';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'success' | 'info';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  group_key: string | null;
  read: boolean;
  timestamp: string;
}

const TYPE_STYLES: Record<string, { border: string; bg: string; dot: string }> = {
  danger:  { border: 'border-l-red-500',    bg: 'bg-red-950/30',    dot: 'bg-red-500' },
  warning: { border: 'border-l-yellow-500', bg: 'bg-yellow-950/20', dot: 'bg-yellow-500' },
  success: { border: 'border-l-green-500',  bg: 'bg-green-950/20',  dot: 'bg-green-500' },
  info:    { border: 'border-l-blue-500',   bg: 'bg-blue-950/20',   dot: 'bg-blue-500' },
};

const PRIORITY_ICON: Record<string, string> = {
  urgent: '🔴', high: '🟠', normal: '', low: '⬇️',
};

function timeAgo(ts: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications((data.notifications as unknown as Notification[]) ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      try {
        await markNotificationsAsRead();
        setUnread(0);
        setNotifications((p) => p.map((n) => ({ ...n, read: true })));
      } catch { /* ignore */ }
    }
  };

  const clearRead = async () => {
    setClearing(true);
    try {
      const readNotifications = notifications.filter((notification) => notification.read);
      await Promise.all(readNotifications.map((notification) => deleteNotification(notification.id)));
      setNotifications((p) => p.filter((n) => !n.read));
    } catch { /* ignore */ }
    finally { setClearing(false); }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell */}
      <button onClick={handleOpen}
        className="relative p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 flex flex-col max-h-[480px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div>
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              <p className="text-[10px] text-gray-600">{unread === 0 ? 'All caught up' : `${unread} unread`}</p>
            </div>
            {notifications.some((n) => n.read) && (
              <button onClick={clearRead} disabled={clearing}
                title="Clear read notifications"
                className="p-1.5 rounded text-gray-700 hover:text-red-400 transition-colors disabled:opacity-40">
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-700">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => {
                const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
                return (
                  <div key={n.id}
                    className={`px-4 py-3 border-b border-gray-800/50 border-l-4 ${style.border} ${n.read ? 'opacity-50' : style.bg} transition-opacity`}>
                    <div className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {PRIORITY_ICON[n.priority] && (
                            <span className="text-[10px]">{PRIORITY_ICON[n.priority]}</span>
                          )}
                          <span className="text-xs font-bold text-white">{n.title}</span>
                          {n.group_key && (
                            <span className="text-[9px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full border border-gray-700">{n.group_key}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 break-words leading-relaxed">{n.message}</p>
                        <p className="text-[9px] text-gray-700 mt-1">{timeAgo(n.timestamp)}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
