'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield, Search, Music, Database, Layers, ArrowRight,
  ExternalLink, Zap, AlertTriangle, CheckCircle, Activity,
  ChevronRight,
} from 'lucide-react';
import { discoverSong, compareAudioFingerprint } from '@/lib/api';

const TOOLS = [
  {
    id: 'youtube-search',
    name: 'YouTube Search',
    desc: 'Discover videos infringing your content across YouTube with artist + song search.',
    href: '/tools/youtube-search',
    icon: Search,
    color: 'from-red-600 to-rose-700',
    step: 1,
    stepLabel: 'Discover',
  },
  {
    id: 'channel-scrape',
    name: 'Channel Scraper',
    desc: 'Scrape an entire YouTube channel to extract all video metadata at once.',
    href: '/tools/channel-scrape',
    icon: Layers,
    color: 'from-purple-600 to-indigo-700',
    step: 2,
    stepLabel: 'Extract',
  },
  {
    id: 'audio-match',
    name: 'Audio Match',
    desc: 'Match audio fingerprints across platforms to confirm infringement.',
    href: '/tools/audio-match',
    icon: Music,
    color: 'from-green-600 to-emerald-700',
    step: 3,
    stepLabel: 'Verify',
  },
  {
    id: 'fingerprint-db',
    name: 'Fingerprint DB',
    desc: 'Generate and compare audio fingerprints stored in the database.',
    href: '/tools/fingerprint-db',
    icon: Database,
    color: 'from-blue-600 to-cyan-700',
    step: 4,
    stepLabel: 'Register',
  },
] as const;

interface QuickResult {
  type: 'search' | 'compare';
  status: 'loading' | 'done' | 'error';
  data?: any;
  error?: string;
}

export default function ProtectionPage() {
  const [quickArtist, setQuickArtist] = useState('');
  const [quickSong, setQuickSong] = useState('');
  const [quickRef, setQuickRef] = useState('');
  const [quickCandidate, setQuickCandidate] = useState('');
  const [result, setResult] = useState<QuickResult | null>(null);

  const runQuickSearch = useCallback(async () => {
    if (!quickArtist.trim() || !quickSong.trim()) return;
    setResult({ type: 'search', status: 'loading' });
    try {
      const data = await discoverSong(quickArtist, quickSong, 20);
      setResult({ type: 'search', status: 'done', data });
    } catch (e: any) {
      setResult({ type: 'search', status: 'error', error: e.message });
    }
  }, [quickArtist, quickSong]);

  const runQuickCompare = useCallback(async () => {
    if (!quickRef.trim() || !quickCandidate.trim()) return;
    setResult({ type: 'compare', status: 'loading' });
    try {
      const data = await compareAudioFingerprint(quickRef, quickCandidate);
      setResult({ type: 'compare', status: 'done', data });
    } catch (e: any) {
      setResult({ type: 'compare', status: 'error', error: e.message });
    }
  }, [quickRef, quickCandidate]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Content Protection Suite</h1>
        <p className="text-sm text-gray-500 mt-1">Discover, verify, and register content infringement across platforms</p>
      </div>

      {/* Workflow steps */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Protection Workflow</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.id} href={tool.href}
                className="group relative rounded-xl border border-gray-800 hover:border-gray-600 bg-gray-950 p-4 transition-all hover:bg-gray-900 overflow-hidden">
                <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${tool.color}`} />
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${tool.color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-gray-600">STEP {tool.step}</span>
                      <span className="text-[10px] font-black text-gray-500 uppercase">{tool.stepLabel}</span>
                    </div>
                    <p className="font-bold text-white text-sm leading-tight">{tool.name}</p>
                    <p className="text-[10px] text-gray-600 mt-1 leading-snug">{tool.desc}</p>
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <span className="flex items-center gap-1 text-[10px] text-gray-600 group-hover:text-gray-400 transition">
                    Open <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick search */}
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-red-400" />
            <p className="font-bold text-white text-sm">Quick Discovery Search</p>
          </div>
          <div className="space-y-2">
            <input
              placeholder="Artist name"
              value={quickArtist}
              onChange={(e) => setQuickArtist(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <input
              placeholder="Song title"
              value={quickSong}
              onChange={(e) => setQuickSong(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runQuickSearch()}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={runQuickSearch}
              disabled={result?.status === 'loading'}
              className="w-full px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-40 transition"
            >
              {result?.type === 'search' && result.status === 'loading' ? 'Searching...' : 'Search YouTube'}
            </button>
          </div>
          {result?.type === 'search' && result.status === 'done' && (
            <div className="mt-3 rounded-lg bg-gray-900 border border-gray-800 p-3">
              <p className="text-xs text-green-400 font-bold mb-2 flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" /> {result.data?.results?.length ?? 0} results found
              </p>
              {result.data?.results?.slice(0, 3).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                  <p className="text-xs text-gray-300 truncate max-w-[70%]">{r.title}</p>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
              <Link href="/tools/youtube-search" className="flex items-center gap-1 mt-2 text-[10px] text-blue-400 hover:underline">
                See all in YouTube Search <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
          {result?.type === 'search' && result.status === 'error' && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {result.error}
            </p>
          )}
        </div>

        {/* Quick compare */}
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-green-400" />
            <p className="font-bold text-white text-sm">Quick Audio Compare</p>
          </div>
          <div className="space-y-2">
            <input
              placeholder="Reference track URL (YouTube/SoundCloud)"
              value={quickRef}
              onChange={(e) => setQuickRef(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <input
              placeholder="Candidate URL to compare"
              value={quickCandidate}
              onChange={(e) => setQuickCandidate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runQuickCompare()}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={runQuickCompare}
              disabled={result?.status === 'loading'}
              className="w-full px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold disabled:opacity-40 transition"
            >
              {result?.type === 'compare' && result.status === 'loading' ? 'Comparing...' : 'Compare Audio'}
            </button>
          </div>
          {result?.type === 'compare' && result.status === 'done' && (
            <div className="mt-3 rounded-lg bg-gray-900 border border-gray-800 p-3 space-y-2">
              <p className={`text-xs font-bold flex items-center gap-1.5 ${result.data?.match ? 'text-red-400' : 'text-green-400'}`}>
                {result.data?.match ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                {result.data?.match ? 'Match Detected!' : 'No Match'}
              </p>
              {result.data?.similarity_score != null && (
                <p className="text-xs text-gray-400">
                  Similarity: <span className="font-bold text-white">{(result.data.similarity_score * 100).toFixed(1)}%</span>
                </p>
              )}
              <Link href="/tools/audio-match" className="flex items-center gap-1 text-[10px] text-blue-400 hover:underline">
                Full analysis in Audio Match <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
          {result?.type === 'compare' && result.status === 'error' && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {result.error}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">All Protection Tools</p>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.id} href={tool.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-sm text-gray-300 hover:text-white transition">
                <Icon className="w-3.5 h-3.5" />
                {tool.name}
                <ExternalLink className="w-3 h-3 text-gray-600" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

