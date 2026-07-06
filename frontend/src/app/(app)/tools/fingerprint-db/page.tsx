'use client';

import { useState } from 'react';
import { generateFingerprint, compareAudioFingerprint } from '@/lib/api';
import { Fingerprint, Zap, RefreshCw, AlertTriangle, ExternalLink, Check, X, Activity } from 'lucide-react';

interface FingerprintResult {
  success: boolean;
  url: string;
  fingerprint_hash?: string;
  chroma_mean?: number[];
  mfcc_mean?: number[];
  spectral_centroid?: number;
  tempo_bpm?: number;
  sample_duration?: number;
  processing_time_seconds?: number;
  error?: string;
}

interface CompareResult {
  success: boolean;
  reference_url: string;
  candidate_url: string;
  algorithms?: { [key: string]: { score: number; weight: number } };
  combined_score: number;
  verified: boolean;
  processing_time_seconds?: number;
  error?: string;
}

function AlgoBar({ name, score, weight }: { name: string; score: number; weight: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-gray-400 text-xs capitalize">{name}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-10 text-right text-xs font-bold ${score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
        {score.toFixed(0)}%
      </span>
      <span className="text-gray-600 text-xs w-12 text-right">×{weight}</span>
    </div>
  );
}

export default function FingerprintDBPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'compare'>('compare');
  const [genUrl, setGenUrl] = useState('');
  const [genResult, setGenResult] = useState<FingerprintResult | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [refUrl, setRefUrl] = useState('');
  const [candUrl, setCandUrl] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!genUrl.trim()) return;
    setGenLoading(true);
    setError('');
    setGenResult(null);
    try {
      const data = await generateFingerprint(genUrl.trim());
      setGenResult(data.data || data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!refUrl.trim() || !candUrl.trim()) return;
    setCompareLoading(true);
    setError('');
    setCompareResult(null);
    try {
      const data = await compareAudioFingerprint(refUrl.trim(), candUrl.trim());
      setCompareResult(data.data || data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Audio Fingerprint Engine</h1>
            <p className="text-gray-400 text-sm">Chromaprint · Spectral · MFCC · Peak Constellation</p>
          </div>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-400 border border-violet-600/40 text-xs font-bold">MULTI-ALGO</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900/50 border border-gray-800 rounded-xl p-1 w-fit">
          {(['compare', 'generate'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-violet-600 text-white shadow' : 'text-gray-400 hover:text-gray-300'
              }`}>
              {tab === 'compare' ? 'Compare Two URLs' : 'Generate Fingerprint'}
            </button>
          ))}
        </div>

        {/* Compare Panel */}
        {activeTab === 'compare' && (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-6 mb-6">
            <p className="text-gray-400 text-sm mb-4">Download audio from two YouTube URLs and compare using 4 algorithms to detect reuploads, edits, slowed/sped versions.</p>
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Reference URL (Official/Canonical)</label>
                <input value={refUrl} onChange={e => setRefUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/60 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Candidate URL (to verify)</label>
                <input value={candUrl} onChange={e => setCandUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/60 text-sm font-mono" />
              </div>
            </div>
            <button onClick={handleCompare} disabled={compareLoading || !refUrl.trim() || !candUrl.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50">
              {compareLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              {compareLoading ? 'Analyzing audio…' : 'Compare Audio'}
            </button>

            {compareResult && (
              <div className="mt-6 space-y-4">
                {/* Score summary */}
                <div className={`p-5 rounded-xl border ${compareResult.verified ? 'bg-green-900/20 border-green-600/50' : 'bg-red-900/20 border-red-600/50'}`}>
                  <div className="flex items-center gap-4 mb-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${compareResult.verified ? 'bg-green-600 text-black' : 'bg-red-600 text-white'}`}>
                      {compareResult.verified ? <Check className="w-7 h-7" /> : <X className="w-7 h-7" />}
                    </div>
                    <div>
                      <p className={`text-3xl font-bold ${compareResult.verified ? 'text-green-400' : 'text-red-400'}`}>
                        {compareResult.combined_score}%
                      </p>
                      <p className={`text-sm font-semibold ${compareResult.verified ? 'text-green-300' : 'text-red-300'}`}>
                        {compareResult.verified ? '✓ Match Verified' : '✗ No Match'}
                      </p>
                    </div>
                    <div className="ml-auto text-right text-xs text-gray-500">
                      <p>{compareResult.processing_time_seconds}s</p>
                      <p>processing</p>
                    </div>
                  </div>

                  {/* Per-algorithm breakdown */}
                  {compareResult.algorithms && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-gray-700/50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Algorithm Breakdown</p>
                      {Object.entries(compareResult.algorithms).map(([name, data]) => (
                        <AlgoBar key={name} name={name} score={data.score} weight={data.weight} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generate Panel */}
        {activeTab === 'generate' && (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-6 mb-6">
            <p className="text-gray-400 text-sm mb-4">Generate a stored fingerprint for a canonical source. Returns chromaprint hash, MFCC descriptor, tempo, and spectral centroid.</p>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">YouTube URL</label>
              <input value={genUrl} onChange={e => setGenUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/60 text-sm font-mono" />
            </div>
            <button onClick={handleGenerate} disabled={genLoading || !genUrl.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50">
              {genLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              {genLoading ? 'Generating…' : 'Generate Fingerprint'}
            </button>

            {genResult && genResult.success && (
              <div className="mt-6 bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Fingerprint Hash</p>
                    <p className="text-green-400 font-mono text-xs">{genResult.fingerprint_hash}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Tempo</p>
                    <p className="text-white font-bold">{genResult.tempo_bpm?.toFixed(1)} BPM</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Spectral Centroid</p>
                    <p className="text-white">{genResult.spectral_centroid?.toFixed(0)} Hz</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Process Time</p>
                    <p className="text-white">{genResult.processing_time_seconds}s</p>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Chroma Vector (first 6)</p>
                  <p className="text-gray-300 font-mono text-xs">[{genResult.chroma_mean?.slice(0, 6).map(n => n.toFixed(3)).join(', ')}…]</p>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Algorithm info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'Chromaprint', desc: 'Pitch-class chroma features (AcoustID standard)', weight: '35%', color: 'border-green-600/30' },
            { name: 'Spectral', desc: 'Energy band distribution comparison', weight: '30%', color: 'border-blue-600/30' },
            { name: 'MFCC', desc: 'Timbral mel-cepstral coefficients', weight: '25%', color: 'border-yellow-600/30' },
            { name: 'Peak Constellation', desc: 'Shazam-style spectral landmark matching', weight: '10%', color: 'border-pink-600/30' },
          ].map(a => (
            <div key={a.name} className={`bg-gray-900/40 border ${a.color} rounded-xl p-4`}>
              <p className="text-white font-semibold text-sm mb-1">{a.name}</p>
              <p className="text-gray-500 text-xs mb-2">{a.desc}</p>
              <p className="text-violet-400 font-bold text-xs">Weight: {a.weight}</p>
            </div>
          ))}
        </div>
    </div>
  );
}
