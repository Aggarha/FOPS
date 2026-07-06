'use client';

import { useState, useRef } from 'react';
import { discoverSong, discoverBatch, exportBatchXlsx, parseBatchUpload } from '@/lib/api';
import {
  Search, Zap, Target, Music, Upload, Download, ChevronDown, ChevronUp,
  ExternalLink, Star, Shield, AlertTriangle, TrendingUp, Play, Users,
  Calendar, Clock, Award, Filter, RefreshCw, Eye
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface DiscoveryResult {
  video_id: string;
  searched_artist: string;
  searched_song: string;
  title: string;
  url: string;
  channel: string;
  channel_url: string;
  subscribers: number | null;
  views: number | null;
  duration: number;
  duration_formatted: string;
  upload_date: string;
  thumbnail: string;
  match_type: string;
  confidence: number;
  is_official: boolean;
  is_short: boolean;
  platform: string;
}

interface SearchGroup {
  artist: string;
  song: string;
  results: DiscoveryResult[];
  canonical: DiscoveryResult | null;
  elapsed_seconds: number;
  total_candidates: number;
  variants_used: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const MATCH_TYPE_COLORS: Record<string, string> = {
  Official:  'bg-green-600/30 text-green-300 border-green-600/50',
  VEVO:      'bg-yellow-500/30 text-yellow-300 border-yellow-500/50',
  Topic:     'bg-blue-600/30 text-blue-300 border-blue-600/50',
  Lyrics:    'bg-purple-600/30 text-purple-300 border-purple-600/50',
  Live:      'bg-red-600/30 text-red-300 border-red-600/50',
  Remix:     'bg-pink-600/30 text-pink-300 border-pink-600/50',
  Slowed:    'bg-cyan-600/30 text-cyan-300 border-cyan-600/50',
  'Sped Up': 'bg-orange-500/30 text-orange-300 border-orange-500/50',
  Cover:     'bg-teal-600/30 text-teal-300 border-teal-600/50',
  Reaction:  'bg-gray-600/30 text-gray-300 border-gray-600/50',
  Clip:      'bg-indigo-600/30 text-indigo-300 border-indigo-600/50',
  Shorts:    'bg-rose-600/30 text-rose-300 border-rose-600/50',
  Reupload:  'bg-amber-600/30 text-amber-300 border-amber-600/50',
};

function MatchBadge({ type }: { type: string }) {
  const cls = MATCH_TYPE_COLORS[type] || 'bg-gray-700/50 text-gray-300 border-gray-700/50';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${cls}`}>
      {type}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
        {score}%
      </span>
    </div>
  );
}

function fmtViews(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtSubs(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

// ── Result Row ─────────────────────────────────────────────────────────────
function ResultRow({ result, isCanonical }: { result: DiscoveryResult; isCanonical: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      isCanonical ? 'border-green-500/60 bg-green-900/10' : 'border-gray-800/60 bg-gray-900/30'
    }`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 w-20 h-12 rounded overflow-hidden bg-gray-800">
          <img src={result.thumbnail} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {isCanonical && (
            <div className="absolute top-0 left-0 bg-green-600 text-white text-[9px] font-bold px-1">CANONICAL</div>
          )}
        </div>

        {/* Title + Channel */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{result.title}</p>
          <p className="text-xs text-gray-400 truncate">{result.channel}</p>
        </div>

        {/* Match Type */}
        <div className="hidden sm:flex flex-shrink-0">
          <MatchBadge type={result.match_type} />
        </div>

        {/* Confidence */}
        <div className="flex-shrink-0 w-24 hidden md:block">
          <ConfidenceBar score={result.confidence} />
        </div>

        {/* Views */}
        <div className="flex-shrink-0 text-right hidden lg:block">
          <p className="text-xs font-bold text-gray-300">{fmtViews(result.views)}</p>
          <p className="text-xs text-gray-600">views</p>
        </div>

        {/* Link */}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-1.5 rounded text-gray-500 hover:text-green-400 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>

        <ChevronDown className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800/50 bg-gray-900/20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
            <div>
              <p className="text-gray-500 mb-0.5">Views</p>
              <p className="text-gray-200 font-semibold">{fmtViews(result.views)}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Subscribers</p>
              <p className="text-gray-200 font-semibold">{fmtSubs(result.subscribers)}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Duration</p>
              <p className="text-gray-200 font-semibold">{result.duration_formatted || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Upload Date</p>
              <p className="text-gray-200 font-semibold">{result.upload_date || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 mb-0.5">Channel</p>
              <a href={result.channel_url} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 truncate block">{result.channel}</a>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 mb-0.5">Match Type</p>
              <MatchBadge type={result.match_type} />
              {result.is_official && <span className="ml-2 text-green-400">✓ Official</span>}
              {result.is_short && <span className="ml-2 text-rose-400">Shorts</span>}
            </div>
          </div>
          <div className="mt-3">
            <p className="text-gray-500 text-xs mb-1">Confidence Score</p>
            <ConfidenceBar score={result.confidence} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Search Group ───────────────────────────────────────────────────────────
function SearchGroupCard({ group, onExport }: { group: SearchGroup; onExport: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const types = ['all', ...Array.from(new Set(group.results.map(r => r.match_type)))];
  const filtered = filterType === 'all' ? group.results : group.results.filter(r => r.match_type === filterType);

  return (
    <div className="border border-gray-700/60 rounded-xl overflow-hidden mb-6">
      {/* Group Header */}
      <div
        className="flex items-center gap-3 p-4 bg-gray-900/60 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
          {group.artist.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold truncate">{group.artist} <span className="text-gray-400 font-normal">—</span> {group.song}</p>
          <p className="text-xs text-gray-500">
            {group.results.length} results · {group.variants_used} variants · {group.elapsed_seconds}s
            {group.canonical && <span className="ml-2 text-green-400">✓ canonical detected</span>}
          </p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          {group.canonical && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Canonical</p>
              <p className="text-xs text-green-400 font-semibold truncate max-w-[120px]">{group.canonical.match_type}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-gray-500">Results</p>
            <p className="text-sm font-bold text-white">{group.results.length}</p>
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
      </div>

      {!collapsed && (
        <div className="p-4 bg-gray-950/30">
          {/* Canonical highlight */}
          {group.canonical && (
            <div className="mb-4 p-3 rounded-lg bg-green-900/20 border border-green-600/40">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-green-400" />
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Canonical Source</span>
              </div>
              <p className="text-sm font-semibold text-white">{group.canonical.title}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span>{group.canonical.channel}</span>
                <MatchBadge type={group.canonical.match_type} />
                <span>{fmtViews(group.canonical.views)} views</span>
                <a href={group.canonical.url} target="_blank" rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Open
                </a>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter className="w-3 h-3 text-gray-500" />
            {types.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  filterType === t ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {t === 'all' ? `All (${group.results.length})` : t}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {filtered.map(r => (
              <ResultRow
                key={r.video_id}
                result={r}
                isCanonical={r.video_id === group.canonical?.video_id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function DiscoveryEnginePage() {
  const [artist, setArtist] = useState('');
  const [song, setSong] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [isrc, setIsrc] = useState('');
  const [upc, setUpc] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [error, setError] = useState('');
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchParsed, setBatchParsed] = useState<any[] | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSingleSearch = async () => {
    if (!artist.trim() || !song.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await discoverSong(artist.trim(), song.trim(), maxResults,
        isrc.trim() || undefined, upc.trim() || undefined);
      const result = data.data || data;
      const group: SearchGroup = {
        artist: result.artist || artist,
        song: result.song || song,
        results: result.results || [],
        canonical: result.canonical || null,
        elapsed_seconds: result.elapsed_seconds || 0,
        total_candidates: result.total_candidates || 0,
        variants_used: result.variants_used || 0,
      };
      setGroups(prev => [group, ...prev]);
    } catch (e: any) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchFileUpload = async (f: File) => {
    setBatchFile(f);
    setBatchLoading(true);
    setError('');
    try {
      const data = await parseBatchUpload(f);
      const result = data.data || data;
      if (!result.success) throw new Error(result.error || 'Parse failed');
      setBatchParsed(result.rows);
    } catch (e: any) {
      setError(e.message);
      setBatchParsed(null);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchSearch = async () => {
    if (!batchParsed?.length) return;
    setLoading(true);
    setError('');
    try {
      const data = await discoverBatch(batchParsed, 30, 3);
      const results = data.data?.results || [];
      const newGroups: SearchGroup[] = results.map((r: any) => ({
        artist: r.artist || '',
        song: r.song || '',
        results: r.results || [],
        canonical: r.canonical || null,
        elapsed_seconds: r.elapsed_seconds || 0,
        total_candidates: r.total_candidates || 0,
        variants_used: r.variants_used || 0,
      }));
      setGroups(prev => [...newGroups, ...prev]);
    } catch (e: any) {
      setError(e.message || 'Batch search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!groups.length) return;
    setExporting(true);
    try {
      const items = groups.map(g => ({ artist: g.artist, song: g.song }));
      const blob = await exportBatchXlsx(items);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fops-discovery-results.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const totalResults = groups.reduce((s, g) => s + g.results.length, 0);

  return (
    <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                <Target className="w-5 h-5 text-black" />
              </div>
              <h1 className="text-2xl font-bold text-white">Discovery Engine</h1>
              <span className="px-2 py-0.5 rounded-full bg-green-600/20 text-green-400 border border-green-600/40 text-xs font-bold">ENTERPRISE</span>
            </div>
            <p className="text-gray-400 text-sm">Multi-variant YouTube search · Match intelligence · Canonical detection · Batch processing</p>
          </div>

          {groups.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right text-sm">
                <p className="text-white font-bold">{totalResults.toLocaleString()}</p>
                <p className="text-gray-500 text-xs">results found</p>
              </div>
              <button
                onClick={handleExportXlsx}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 border border-emerald-600/50 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-all text-sm font-medium disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting ? 'Exporting…' : 'Export XLSX'}
              </button>
              <button
                onClick={() => setGroups([])}
                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900/50 border border-gray-800 rounded-xl p-1 w-fit">
          {(['single', 'batch'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab === 'single' ? (
                <><Search className="w-3.5 h-3.5 inline mr-1.5" />Single Search</>
              ) : (
                <><Upload className="w-3.5 h-3.5 inline mr-1.5" />Batch Upload</>
              )}
            </button>
          ))}
        </div>

        {/* Single Search Panel */}
        {activeTab === 'single' && (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Artist Name</label>
                <input
                  value={artist}
                  onChange={e => setArtist(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSingleSearch()}
                  placeholder="e.g. Rotana, محمد عبده"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-green-600/60 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Song Name</label>
                <input
                  value={song}
                  onChange={e => setSong(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSingleSearch()}
                  placeholder="e.g. يا مسافر وحدك"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-green-600/60 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">ISRC (optional)</label>
                <input
                  value={isrc}
                  onChange={e => setIsrc(e.target.value)}
                  placeholder="GBUM71234567"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-green-600/60 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">UPC (optional)</label>
                <input
                  value={upc}
                  onChange={e => setUpc(e.target.value)}
                  placeholder="00028947654321"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-green-600/60 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Max Results</label>
                <select
                  value={maxResults}
                  onChange={e => setMaxResults(Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-600/60 text-sm"
                >
                  {[25, 50, 100, 150, 200].map(n => <option key={n} value={n}>{n} results</option>)}
                </select>
              </div>
            </div>
            <button
              onClick={handleSingleSearch}
              disabled={loading || !artist.trim() || !song.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-black font-bold rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Searching…' : 'Launch Discovery'}
            </button>
          </div>
        )}

        {/* Batch Upload Panel */}
        {activeTab === 'batch' && (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-6 mb-6">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-700 rounded-xl p-10 text-center cursor-pointer hover:border-green-600/50 hover:bg-green-900/10 transition-all group mb-4"
            >
              <Upload className="w-10 h-10 text-gray-600 group-hover:text-green-500 mx-auto mb-3 transition-colors" />
              <p className="text-gray-300 font-semibold mb-1">Drop Excel or CSV file</p>
              <p className="text-gray-500 text-sm">Columns: artist, song (+ optional: isrc, upc). Arabic names supported.</p>
              {batchFile && <p className="mt-2 text-green-400 text-sm font-medium">{batchFile.name}</p>}
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && handleBatchFileUpload(e.target.files[0])} />
            </div>

            {batchParsed && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-300">
                    <span className="text-green-400 font-bold">{batchParsed.length}</span> songs parsed and ready
                  </p>
                </div>
                <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-800">
                      <th className="text-left p-2 text-gray-500">#</th>
                      <th className="text-left p-2 text-gray-500">Artist</th>
                      <th className="text-left p-2 text-gray-500">Song</th>
                      <th className="text-left p-2 text-gray-500">ISRC</th>
                    </tr></thead>
                    <tbody>
                      {batchParsed.slice(0, 20).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800/50">
                          <td className="p-2 text-gray-600">{i + 1}</td>
                          <td className="p-2 text-gray-300">{row.artist}</td>
                          <td className="p-2 text-gray-300">{row.song}</td>
                          <td className="p-2 text-gray-500">{row.isrc || '—'}</td>
                        </tr>
                      ))}
                      {batchParsed.length > 20 && (
                        <tr><td colSpan={4} className="p-2 text-gray-500 text-center">+{batchParsed.length - 20} more…</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              onClick={handleBatchSearch}
              disabled={loading || !batchParsed?.length}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-black font-bold rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? `Searching ${batchParsed?.length || 0} songs…` : `Search ${batchParsed?.length || 0} Songs`}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-green-900/20 border border-green-600/40 rounded-xl">
              <RefreshCw className="w-5 h-5 text-green-400 animate-spin" />
              <span className="text-green-300 font-medium">Searching across {maxResults} variants…</span>
            </div>
            <p className="text-gray-600 text-xs mt-2">Multi-variant search · Match classification · Canonical detection</p>
          </div>
        )}

        {/* Results */}
        {groups.length > 0 && !loading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                Search Results <span className="text-gray-500 text-sm font-normal ml-2">{groups.length} session{groups.length !== 1 ? 's' : ''}</span>
              </h2>
            </div>
            {groups.map((g, i) => (
              <SearchGroupCard key={i} group={g} onExport={handleExportXlsx} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {groups.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-600">
            <Target className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold mb-1">Discovery Engine Ready</p>
            <p className="text-sm">Search a single song or upload an Excel file for batch discovery</p>
          </div>
        )}
    </div>
  );
}
