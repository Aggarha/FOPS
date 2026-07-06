'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import {
  fetchGlobalChatMessages,
  sendGlobalChatMessage,
  type ChatMessage,
} from '@/lib/api';

export function GlobalChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await fetchGlobalChatMessages(100);
      setMessages((data.messages as ChatMessage[]).reverse());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    const iv = setInterval(fetchMessages, 5000);
    return () => clearInterval(iv);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const data = await sendGlobalChatMessage(input.trim());
      setMessages((prev) => [...prev, data.message]);
      setInput('');
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 border border-gray-900 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900 bg-gray-950">
        <h2 className="text-sm font-bold text-white">Global Chat</h2>
        <p className="text-[10px] text-gray-600">{messages.length} messages</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-700 text-sm">No messages yet</div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${msg.is_system ? 'text-center' : ''}`}>
              {msg.is_system ? (
                <span className="text-xs text-gray-700 italic">{msg.content}</span>
              ) : (
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400 flex-shrink-0">
                    {msg.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-green-400">{msg.user_name}</span>
                      <span className="text-[9px] text-gray-700">{new Date(msg.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-gray-200 mt-0.5 break-words leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-900 bg-gray-950">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Send a message…"
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg transition disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

