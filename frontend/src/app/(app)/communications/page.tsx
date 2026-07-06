'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Mail, Bell, Users, Loader2 } from 'lucide-react';
import { GlobalChat } from '@/components/communications/GlobalChat';
import { PrivateMessages } from '@/components/communications/PrivateMessages';
import { NotificationsPanel } from '@/components/communications/NotificationsPanel';
import { fetchOnlinePresence } from '@/lib/api';

type CommunicationTab = 'global' | 'dm' | 'notifications' | 'presence';

const statusColor: Record<string, string> = {
  online: 'bg-green-500', away: 'bg-yellow-500', busy: 'bg-red-500',
};

function OnlineUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const data = await fetchOnlinePresence();
      setUsers(data.online_users ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch_();
    const iv = setInterval(fetch_, 15000);
    return () => clearInterval(iv);
  }, [fetch_]);

  return (
    <div className="bg-gray-950 border border-gray-900 rounded-xl p-4 h-full">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
        <Users className="w-3.5 h-3.5" /> Online Users
        <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-900 px-1.5 py-0.5 rounded-full">{users.length}</span>
      </h3>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-gray-700 animate-spin" /></div>
      ) : users.length === 0 ? (
        <p className="text-xs text-gray-700 text-center py-6">No one online</p>
      ) : (
        <div className="space-y-1.5">
          {users.map((u: any) => (
            <div key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-900 transition">
              <div className={`w-2 h-2 rounded-full ${statusColor[u.status] ?? 'bg-gray-500'}`} />
              <p className="text-xs text-gray-400">{u.user_name ?? u.user_id}</p>
              {u.current_tool && <p className="text-[9px] text-gray-700 ml-auto">{u.current_tool}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<CommunicationTab>('global');

  const tabs: { id: CommunicationTab; label: string; icon: React.ReactNode }[] = [
    { id: 'global', label: 'Global Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'dm', label: 'Direct Messages', icon: <Mail className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'presence', label: 'Online Users', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Communications</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time team messaging and notifications</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-900">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === tab.id
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-gray-600 hover:text-gray-400'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[600px]">
        {activeTab === 'global' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
            <div className="lg:col-span-2 h-full"><GlobalChat /></div>
            <div className="h-full"><OnlineUsers /></div>
          </div>
        )}
        {activeTab === 'dm' && <div className="h-[600px]"><PrivateMessages /></div>}
        {activeTab === 'notifications' && <div className="h-[600px]"><NotificationsPanel /></div>}
        {activeTab === 'presence' && <div className="h-[600px]"><OnlineUsers /></div>}
      </div>
    </div>
  );
}
