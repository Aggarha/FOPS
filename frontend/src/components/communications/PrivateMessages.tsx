'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';
import {
  fetchConversations as fetchConversationsRequest,
  fetchConversationMessages,
  sendConversationMessage,
  type ConversationSummary,
  type DirectMessage,
} from '@/lib/api';

export function PrivateMessages() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await fetchConversationsRequest();
      setConversations(data.conversations ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchMessages = useCallback(async (otherUserId: number) => {
    try {
      const data = await fetchConversationMessages(otherUserId);
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => {
    if (selectedConv) fetchMessages(selectedConv.other_user_id);
  }, [selectedConv, fetchMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selectedConv) return;
    setLoading(true);
    try {
      const data = await sendConversationMessage(selectedConv.other_user_id, input.trim());
      setMessages((p) => [...p, data.message]);
      setInput('');
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="flex h-full gap-3">
      {/* Conversations List */}
      <div className="w-56 bg-gray-950 border border-gray-900 rounded-xl flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-900">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Direct Messages
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-4 text-xs text-gray-700 text-center">No conversations</p>
          ) : conversations.map((conv) => (
            <button key={conv.id} onClick={() => setSelectedConv(conv)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-900 transition text-sm ${
                selectedConv?.id === conv.id ? 'bg-green-900/20' : 'hover:bg-gray-900'
              }`}>
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">{conv.other_user_name}</span>
                {conv.unread_count > 0 && (
                  <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full">{conv.unread_count}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConv ? (
        <div className="flex-1 bg-gray-950 border border-gray-900 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-900">
            <h3 className="text-sm font-bold text-white">{selectedConv.other_user_name}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg) => (
              <div key={msg.id}>
                <span className="text-xs font-bold text-green-400">{msg.sender_name}</span>
                <span className="text-[9px] text-gray-700 ml-2">{new Date(msg.created_at).toLocaleTimeString()}</span>
                <p className="text-sm text-gray-200 mt-0.5 break-words">{msg.content}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="px-4 py-3 border-t border-gray-900 flex gap-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg transition disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-gray-950 border border-gray-900 rounded-xl flex items-center justify-center">
          <p className="text-gray-700 text-sm">Select a conversation</p>
        </div>
      )}
    </div>
  );
}
