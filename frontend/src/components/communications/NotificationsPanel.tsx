'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import {
  fetchCommunicationNotifications as fetchNotificationsRequest,
  markCommunicationNotificationRead,
  markCommunicationNotificationsAsRead,
  type CommunicationNotification,
} from '@/lib/api';

const typeIcon: Record<string, string> = {
  mention: '👤', comment: '💬', match: '🎵', job: '⚙️', message: '📧',
};

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<CommunicationNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await fetchNotificationsRequest();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread ?? 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 10000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  const markRead = async (id: number) => {
    try {
      await markCommunicationNotificationRead(id);
      fetchNotifications();
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await markCommunicationNotificationsAsRead();
      fetchNotifications();
    } catch { /* ignore */ }
    finally { setMarkingAll(false); }
  };

  return (
    <div className="bg-gray-950 border border-gray-900 rounded-xl flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900 flex justify-between items-center">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" /> Notifications
          {unreadCount > 0 && (
            <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </h3>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={markingAll}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition disabled:opacity-40">
            {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />} Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-700 text-sm">No notifications</div>
        ) : notifications.map((n) => (
          <div key={n.id}
            onClick={() => !n.read && markRead(n.id)}
            className={`flex gap-2.5 items-start px-4 py-3 border-b border-gray-900 transition cursor-pointer ${
              n.read ? 'opacity-50' : 'hover:bg-gray-900/50'
            }`}>
            <span className="text-base">{typeIcon[n.type] ?? '🔔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{n.title}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
              <p className="text-[9px] text-gray-700 mt-1">{new Date(n.created_at).toLocaleTimeString()}</p>
            </div>
            {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
