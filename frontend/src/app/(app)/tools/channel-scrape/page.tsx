'use client';

import { useState } from 'react';
import { scrapeChannel } from '@/lib/api';
import {
  Layers, Search, Download, RefreshCw, ExternalLink, AlertTriangle,
  Play, Film, Zap, ChevronDown, Filter, Users, Eye, Clock, Calendar
} from 'lucide-react';

interface VideoResult {
  video_id: string;
  title: string;
  url: string;
  duration: number;
  duration_formatted: string;
  views: number | null;
  upload_date: string;
  channel: string;
  channel_url: string;
  thumbnail: string;
  match_type: string;
  is_short: boolean;
  is_live: boolean;
}

interface ChannelInfo {
  id: string;
  name: string;
  url: string;
  subscribers: number | null;
  video_count: number;
}

const MATCH_TYPE_COLORS: Record<string, string> = {
  Official:  'bg-green-600/20 text-green-300 border-green-600/40',
  VEVO:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  Lyrics:    'bg-purple-600/20 text-purple-300 border-purple-600/40',
  Live:      'bg-red-600/20 text-red-300 border-red-600/40',
  Shorts:    'bg-rose-600/20 text-rose-300 border-rose-600/40',
  Upload:    'bg-gray-700/30 text-gray-300 border-gray-700/40',
  Remix:     'bg-pink-600/20 text-pink-300 border-pink-600/40',
};

function fmtNum(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function MatchBadge({ type }: { type: string }) {
  const cls = MATCH_TYPE_COLORS[type] || 'bg-gray-700/30 text-gray-300 border-gray-700/40';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>{type}</span>;
}

export default function ChannelScrapePage() {
  const [channelInput, setChannelInput] = useState('');
  const [maxResults, setMaxResults] = useState(0);
  const [includeShorts, setIncludeShorts] = useState(true);
  const [includeLive, setIncludeLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState<'default' | 'views' | 'date'>('default');

  const handleScrape = async () => {
    if (!channelInput.trim()) return;
    setLoading(true);
    setError('');
    setVideos([]);
    setChannel(null);
    try {
      const data = await scrapeChannel(channelInput.trim(), maxResults, includeShorts, includeLive);
      const result = data.data || data;
      if (!result.success && !result.total_collected) {
        throw new Error(result.error || 'No videos found');
      }
      setChannel(result.channel || null);
      setVideos(result.videos || []);
      setElapsed(result.elapsed_seconds || 0);
    } catch (e: any) {
      setError(e.message || 'Scrape failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!videos.length) return;
    const header = 'Video ID,Title,URL,Duration,Views,Upload Date,Channel,Match Type,Is Short,Is Live\n';
    const rows = videos.map(v =>
      [v.video_id, `"${v.title.replace(/"/g, '""')}"`, v.url, v.duration_formatted, v.views || '',
       v.upload_date, `"${v.channel}"`, v.match_type, v.is_short, v.is_live].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${channel?.name || 'channel'}-videos.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify({ channel, videos, total: videos.length }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${channel?.name || 'channel'}-videos.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const types = ['all', ...Array.from(new Set(videos.map(v => v.match_type)))];
  let filtered = filterType === 'all' ? videos : videos.filter(v => v.match_type === filterType);
  if (sortBy === 'views') filtered = [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0));
  if (sortBy === 'date') filtered = [...filtered].sort((a, b) => (b.upload_date || '').localeCompare(a.upload_date || ''));

  return (
    <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center">
                <Layers className="w-5 h-5 text-black" />
              </div>
              <h1 className="text-2xl font-bold text-white">Channel Scraper</h1>
              <span className="px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-600/40 text-xs font-bold">UNLIMITED</span>
            </div>
            <p className="text-gray-400 text-sm">All URL formats · Videos + Shorts + Streams · Unlimited depth · Rich metadata</p>
          </div>

          {videos.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded-lg hover:bg-blue-600/30 text-sm transition-all">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button onClick={handleExportJSON}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/40 border border-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700/60 text-sm transition-all">
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Channel URL / Handle / ID</label>
              <input
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
                placeholder="@Rotana  or  youtube.com/c/Rotana  or  UCXXXXX"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Limit</label>
              <select
                value={maxResults}
                onChange={e => setMaxResults(Number(e.target.value))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/60 text-sm"
              >
                <option value={0}>Unlimited</option>
                {[100, 500, 1000, 5000, 10000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeShorts} onChange={e => setIncludeShorts(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm text-gray-300">Include Shorts</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeLive} onChange={e => setIncludeLive(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm text-gray-300">Include Streams</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleScrape}
            disabled={loading || !channelInput.trim()}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-black font-bold rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Scraping…' : 'Start Scrape'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
            <p className="text-blue-300 font-medium">Scraping channel…</p>
            <p className="text-gray-600 text-xs mt-1">Crawling Videos · Shorts · Streams</p>
          </div>
        )}

        {/* Channel Card */}
        {channel && !loading && (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
                {channel.name?.charAt(0) || 'C'}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white truncate">{channel.name}</h2>
                <a href={channel.url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">
                  {channel.url} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{fmtNum(channel.subscribers)}</p>
                  <p className="text-xs text-gray-500">Subscribers</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-400">{videos.length.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Scraped</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-400">{elapsed}s</p>
                  <p className="text-xs text-gray-500">Time</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter + Sort bar */}
        {videos.length > 0 && !loading && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-3 h-3 text-gray-500" />
              {types.map(t => (
                <button key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    filterType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}>
                  {t === 'all' ? `All (${videos.length})` : t}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              {(['default', 'views', 'date'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    sortBy === s ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Videos Table */}
        {filtered.length > 0 && !loading && (
          <div className="border border-gray-800/60 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/80 border-b border-gray-800">
                    <th className="text-left p-3 text-gray-500 text-xs font-semibold w-16">Thumb</th>
                    <th className="text-left p-3 text-gray-500 text-xs font-semibold">Title</th>
                    <th className="text-left p-3 text-gray-500 text-xs font-semibold hidden md:table-cell">Type</th>
                    <th className="text-right p-3 text-gray-500 text-xs font-semibold hidden lg:table-cell">Views</th>
                    <th className="text-left p-3 text-gray-500 text-xs font-semibold hidden lg:table-cell">Date</th>
                    <th className="text-left p-3 text-gray-500 text-xs font-semibold hidden sm:table-cell">Duration</th>
                    <th className="p-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v, i) => (
                    <tr key={v.video_id} className={`border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-900/20'}`}>
                      <td className="p-2">
                        <div className="w-14 h-9 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                          <img src={v.thumbnail} alt="" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      </td>
                      <td className="p-2">
                        <p className="text-gray-200 font-medium line-clamp-1 text-xs">{v.title}</p>
                        <p className="text-gray-500 text-xs truncate hidden sm:block">{v.channel}</p>
                      </td>
                      <td className="p-2 hidden md:table-cell">
                        <MatchBadge type={v.match_type} />
                        {v.is_short && <span className="ml-1 text-rose-400 text-xs">S</span>}
                      </td>
                      <td className="p-2 text-right hidden lg:table-cell">
                        <span className="text-gray-300 text-xs font-medium">{fmtNum(v.views)}</span>
                      </td>
                      <td className="p-2 hidden lg:table-cell">
                        <span className="text-gray-400 text-xs">{v.upload_date || '—'}</span>
                      </td>
                      <td className="p-2 hidden sm:table-cell">
                        <span className="text-gray-400 text-xs">{v.duration_formatted || '—'}</span>
                      </td>
                      <td className="p-2">
                        <a href={v.url} target="_blank" rel="noopener noreferrer"
                          className="p-1 text-gray-600 hover:text-blue-400 transition-colors inline-block">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {videos.length === 0 && !loading && !error && (
          <div className="text-center py-20 text-gray-600">
            <Layers className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold mb-1">Channel Scraper Ready</p>
            <p className="text-sm">Supports @handles, /c/ URLs, /channel/ IDs, and bare channel names</p>
          </div>
        )}
    </div>
  );
}
