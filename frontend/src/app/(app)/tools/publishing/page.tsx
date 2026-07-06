'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search, FileText, Download, Copy, Check, ChevronDown, ChevronRight,
  Music, Video, Mic2, Disc3, Layers, RefreshCw, X, Loader2,
  Tag, Hash, AlignLeft, Globe, Settings, BookOpen, Zap, Plus,
  Trash2, Edit3, Save, ExternalLink, Database, LayoutTemplate, Eye,
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch, authenticatedFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full canonical record from publishing_imports (Phase A2) */
interface PublishingRelease {
  id: number;
  source_id: number;
  artist_en: string;
  artist_ar: string;
  song_en: string;
  song_ar: string;
  album_en: string;
  album_ar: string;
  upc: string;
  isrc: string;
  genre: string;
  nationality: string;
  release_date: string;
  duration: string;
  track_number: string;
  track_count: string;
  songwriter_en: string;
  songwriter_ar: string;
  composer_en: string;
  composer_ar: string;
  arranger_en: string;
  arranger_ar: string;
}

interface SheetRelease {
  artist: string;
  song: string;
  upc?: string;
  date?: string;
  release_type?: string;
  label?: string;
  eg_time?: string;
  ksa_time?: string;
  delivery_youtube?: string;
  notes?: string;
}

interface FormatResult {
  success: boolean;
  title: string;
  description: string;
  tags: string;
  tags_list?: string[];
  isrc: string;
  upc: string;
  video_type: string;
  channel: string;
  has_lyrics: boolean;
  error?: string;
}

interface FormState {
  // Source
  source: 'manual' | 'picker' | 'upc';
  // Artist / Song fields
  artist_en: string;
  artist_ar: string;
  song_en: string;
  song_ar: string;
  album_en: string;
  album_ar: string;
  songwriter_en: string;
  songwriter_ar: string;
  composer_en: string;
  composer_ar: string;
  arranger_en: string;
  arranger_ar: string;
  isrc: string;
  upc: string;
  // Config
  video_type: string;
  channel: string;
  lyrics: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_TYPES = [
  { id: 'Music Video', label: 'Music Video', icon: Video, color: 'text-pink-400 border-pink-800 bg-pink-950/30' },
  { id: 'Lyrics Video', label: 'Lyrics Video', icon: FileText, color: 'text-blue-400 border-blue-800 bg-blue-950/30' },
  { id: 'Concert', label: 'Concert', icon: Mic2, color: 'text-orange-400 border-orange-800 bg-orange-950/30' },
];

const TEMPLATE_EXTRAS = [
  { id: 'Album', label: 'Album', icon: Disc3, note: 'Use Music Video with album fields' },
  { id: 'EP', label: 'EP', icon: Layers, note: 'Use Lyrics Video with EP context' },
  { id: 'Acoustic', label: 'Acoustic', note: 'Add "(Acoustic)" to song name' },
  { id: 'Remix', label: 'Remix', note: 'Add "(Remix)" to song name' },
];

const DEFAULT_FORM: FormState = {
  source: 'manual',
  artist_en: '', artist_ar: '',
  song_en: '', song_ar: '',
  album_en: '', album_ar: '',
  songwriter_en: '', songwriter_ar: '',
  composer_en: '', composer_ar: '',
  arranger_en: '', arranger_ar: '',
  isrc: '', upc: '',
  video_type: 'Music Video',
  channel: 'Rotana Music',
  lyrics: '',
};

// ─── Template types ──────────────────────────────────────────────────────────────

interface PubTemplate {
  id: number;
  name: string;
  type: string;
  title_template: string;
  description_template: string;
  tags_template: string;
  active: boolean;
}

interface PubChannel {
  id: number;
  channel_name: string;
  intro_text: string;
  subscribe_text: string;
  social_links: Record<string, string>;
  footer_text: string;
  active: boolean;
}

const VIDEO_TYPE_TO_TEMPLATE: Record<string, string> = {
  'Music Video':  'music_video',
  'Lyrics Video': 'lyrics_video',
  'Concert':      'concert',
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function InputRow({ label, value, onChange, placeholder, rtl }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rtl?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={rtl ? 'rtl' : undefined}
        className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none transition-colors"
      />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (copied ? 'Copied!' : 'Copy')}
    </button>
  );
}

// ─── Release Picker (in-page, searches publishing imports) ───────────────────

function ReleasePicker({ onSelectPublishing, onSelectSheet }: {
  onSelectPublishing: (r: PublishingRelease) => void;
  onSelectSheet: (r: SheetRelease) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(PublishingRelease | SheetRelease)[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'library' | 'sheets'>('library');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string, src: 'library' | 'sheets') => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (src === 'library') {
          const data = await apiFetch<{ releases?: PublishingRelease[] }>(
            `/api/publishing/releases/search?q=${encodeURIComponent(q)}&limit=20`
          );
          setResults(data.releases || []);
        } else {
          const data = await apiFetch<{ results?: SheetRelease[] }>(
            `/api/releases/search?q=${encodeURIComponent(q)}&limit=20`
          );
          setResults(data.results || []);
        }
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
  }, []);

  useEffect(() => { search(query, source); }, [query, source, search]);

  const isLibraryResult = (r: PublishingRelease | SheetRelease): r is PublishingRelease =>
    'song_en' in r;

  return (
    <div className="space-y-3">
      {/* Source tabs */}
      <div className="flex gap-1">
        {([['library', 'Source Library'], ['sheets', 'Google Sheets']] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setSource(id); setResults([]); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${source === id ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={source === 'library' ? "Search artist, song, UPC, ISRC…" : "Search by artist or song…"}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none transition-colors"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 animate-spin" />}
        {!loading && query && <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"><X className="w-4 h-4" /></button>}
      </div>

      {results.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.map((r, i) => {
            const isLib = isLibraryResult(r);
            const title  = isLib ? (r.song_en   || r.song_ar)   : r.song;
            const artist = isLib ? (r.artist_en || r.artist_ar) : r.artist;
            const code   = isLib ? r.upc : r.upc;
            return (
              <button key={i}
                onClick={() => {
                  if (isLib) { onSelectPublishing(r); }
                  else { onSelectSheet(r); }
                  setQuery(''); setResults([]);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors border-b border-gray-900/80 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{title}</p>
                  <p className="text-xs text-gray-500 truncate">{artist}</p>
                </div>
                {isLib && (r.genre || r.nationality) && (
                  <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border text-blue-400 border-blue-800 bg-blue-950/30">
                    {r.genre || r.nationality}
                  </span>
                )}
                {!isLib && r.release_type && (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border text-blue-400 border-blue-800 bg-blue-950/30">
                    {r.release_type.toUpperCase()}
                  </span>
                )}
                {code && <span className="shrink-0 font-mono text-[10px] text-gray-600">{code}</span>}
                <ChevronRight className="w-3.5 h-3.5 text-gray-700 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
      {query && !loading && results.length === 0 && (
        <p className="text-center text-sm text-gray-600 py-4">No releases found for "{query}"</p>
      )}
    </div>
  );
}

// ─── UPC Lookup ───────────────────────────────────────────────────────────────

function UPCLookup({ onSelect }: { onSelect: (r: SheetRelease) => void }) {
  const [upc, setUpc] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [result, setResult] = useState<SheetRelease | null>(null);

  const lookup = async () => {
    if (!upc.trim()) return;
    setStatus('loading');
    try {
      const data = await apiFetch<SheetRelease>(`/api/releases/by-upc/${encodeURIComponent(upc.trim())}`);
      setResult(data);
      setStatus('found');
    } catch {
      setResult(null);
      setStatus('notfound');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={upc}
          onChange={(e) => { setUpc(e.target.value); setStatus('idle'); }}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="Enter UPC or ISRC…"
          className="flex-1 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none font-mono transition-colors"
        />
        <button onClick={lookup} disabled={status === 'loading' || !upc.trim()}
          className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center gap-2">
          {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Lookup
        </button>
      </div>
      {status === 'found' && result && (
        <div className="rounded-lg border border-green-900/50 bg-green-950/20 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-white">{result.song}</p>
            <p className="text-xs text-gray-400">{result.artist} · {result.date}</p>
            <p className="text-[10px] font-mono text-gray-600 mt-1">{result.upc}</p>
          </div>
          <button onClick={() => { onSelect(result!); setUpc(''); setStatus('idle'); setResult(null); }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-all">
            Use this
          </button>
        </div>
      )}
      {status === 'notfound' && (
        <p className="text-sm text-red-400 text-center py-2">No release found for UPC: {upc}</p>
      )}
    </div>
  );
}

// ─── Channel Manager ──────────────────────────────────────────────────────────

function ChannelManager({ channels, onUpdate }: { channels: string[]; onUpdate: () => void }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const addChannel = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/video/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), description: '' }) });
      setNewName('');
      onUpdate();
    } finally { setSaving(false); }
  };

  const removeChannel = async (name: string) => {
    await apiFetch(`/api/video/channels/${encodeURIComponent(name)}`, { method: 'DELETE' });
    onUpdate();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChannel()}
          placeholder="New channel name…" className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none transition-colors" />
        <button onClick={addChannel} disabled={saving || !newName.trim()} className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {channels.map((c) => (
          <div key={c} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-800/40">
            <span className="text-sm text-gray-300 truncate">{c}</span>
            <button onClick={() => removeChannel(c)} className="shrink-0 p-1 rounded text-gray-700 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Output Panel ─────────────────────────────────────────────────────────────

function OutputSection({ result, form }: { result: FormatResult; form: FormState }) {
  const [editDesc, setEditDesc] = useState(result.description);
  const [editTitle, setEditTitle] = useState(result.title);
  const [editTags, setEditTags] = useState(result.tags);

  useEffect(() => { setEditTitle(result.title); setEditDesc(result.description); setEditTags(result.tags); }, [result]);

  const downloadTXT = () => {
    const content = `TITLE:\n${editTitle}\n\n${'─'.repeat(60)}\n\nDESCRIPTION:\n${editDesc}\n\n${'─'.repeat(60)}\n\nTAGS:\n${editTags}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    a.download = `${form.artist_en}_${form.song_en}_publishing.txt`.replace(/\s+/g, '_');
    a.click();
  };

  const downloadDOCX = async () => {
    const res = await authenticatedFetch('/api/video/export-docx', {
      method: 'POST',
      body: JSON.stringify({ title: editTitle, description: editDesc, tags: editTags, channel: form.channel, video_type: form.video_type, artist: form.artist_en, song: form.song_en }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${form.artist_en}_${form.song_en}_publishing.docx`.replace(/\s+/g, '_');
    a.click();
  };

  const ytFormat = `Title: ${editTitle}\n\nDescription:\n${editDesc}\n\nTags: ${editTags}`;

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><Tag className="w-4 h-4 text-gray-500" /> Title</div>
          <CopyButton text={editTitle} />
        </div>
        <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} rows={2}
          className="w-full px-4 py-3 bg-transparent text-sm text-gray-200 font-medium resize-none focus:outline-none" />
      </div>

      {/* Description */}
      <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><AlignLeft className="w-4 h-4 text-gray-500" /> Description</div>
          <CopyButton text={editDesc} />
        </div>
        <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={10}
          className="w-full px-4 py-3 bg-transparent text-xs text-gray-300 font-mono resize-none focus:outline-none" />
      </div>

      {/* Tags */}
      <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><Hash className="w-4 h-4 text-gray-500" /> Tags</div>
          <CopyButton text={editTags} />
        </div>
        <textarea value={editTags} onChange={(e) => setEditTags(e.target.value)} rows={2}
          className="w-full px-4 py-3 bg-transparent text-xs text-gray-400 font-mono resize-none focus:outline-none" />
        {result.tags_list && result.tags_list.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {result.tags_list.map((t, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Export Actions */}
      <div className="rounded-xl border border-gray-800/50 bg-gray-950 p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Export</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={ytFormat} label="Copy YouTube Format" />
          <button onClick={downloadTXT} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all">
            <Download className="w-3.5 h-3.5" /> Download TXT
          </button>
          <button onClick={downloadDOCX} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-800/50 hover:bg-blue-700/50 text-blue-300 border border-blue-800 transition-all">
            <Download className="w-3.5 h-3.5" /> Download DOCX
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublishingSuitePage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<FormatResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [showChannelMgr, setShowChannelMgr] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'suite' | 'credits'>('suite');
  const [copyDone, setCopyDone] = useState(false);
  const [autofillBanner, setAutofillBanner] = useState<string | null>(null);

  // Phase A3 — template / channel selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedChannelId,   setSelectedChannelId]  = useState<number | null>(null);
  const [pubTemplates,        setPubTemplates]        = useState<PubTemplate[]>([]);
  const [pubChannels,         setPubChannels]         = useState<PubChannel[]>([]);

  const set = (key: keyof FormState, val: string) => setForm((f) => ({ ...f, [key]: val }));

  // ── Autofill from Release Picker (sessionStorage) ────────────────────────
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get('autofill') === '1' && typeof window !== 'undefined') {
      const raw = sessionStorage.getItem('publishing_autofill');
      if (raw) {
        try {
          const record: PublishingRelease = JSON.parse(raw);
          fillFromPublishingRecord(record);
          sessionStorage.removeItem('publishing_autofill');
          const label = [record.song_en, record.artist_en].filter(Boolean).join(' — ');
          setAutofillBanner(label || 'Release data loaded');
          setTimeout(() => setAutofillBanner(null), 5000);
        } catch { /* ignore */ }
      }
      // Clean up URL without reload
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('autofill');
        window.history.replaceState({}, '', url.toString());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const loadChannels = useCallback(async () => {
    try {
      const data = await apiFetch<{ channels?: string[] }>('/api/video/channels');
      setChannels(data.channels || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  // Load active publishing templates + channel templates (A3)
  useEffect(() => {
    apiFetch('/api/publishing/templates?active=true')
      .then((r: { success: boolean; templates: PubTemplate[] }) => { if (r.success) setPubTemplates(r.templates); })
      .catch(() => {});
    apiFetch('/api/publishing/channels?active=true')
      .then((r: { success: boolean; channels: PubChannel[] }) => { if (r.success) setPubChannels(r.channels); })
      .catch(() => {});
  }, []);

  // Autofill from a full publishing record (all 20 fields)
  const fillFromPublishingRecord = useCallback((r: PublishingRelease) => {
    setForm((f) => ({
      ...f,
      source: 'picker',
      artist_en:    r.artist_en    || '',
      artist_ar:    r.artist_ar    || '',
      song_en:      r.song_en      || '',
      song_ar:      r.song_ar      || '',
      album_en:     r.album_en     || '',
      album_ar:     r.album_ar     || '',
      songwriter_en:r.songwriter_en|| '',
      songwriter_ar:r.songwriter_ar|| '',
      composer_en:  r.composer_en  || '',
      composer_ar:  r.composer_ar  || '',
      arranger_en:  r.arranger_en  || '',
      arranger_ar:  r.arranger_ar  || '',
      upc:          r.upc          || '',
      isrc:         r.isrc         || '',
    }));
    if (r.songwriter_en || r.composer_en || r.arranger_en) setShowAdvanced(true);
    setResult(null);
  }, []);

  // Legacy autofill from sheet release (artist/song/upc only)
  const fillFromRelease = useCallback((r: SheetRelease) => {
    setForm((f) => ({
      ...f,
      artist_en: r.artist || '',
      song_en: r.song || '',
      upc: r.upc || '',
    }));
    setResult(null);
  }, []);

  const generate = async () => {
    setGenerating(true);
    setResult(null);
    try {
      const payload = {
        artist_en: form.artist_en,
        artist_ar: form.artist_ar,
        song_en: form.song_en,
        song_ar: form.song_ar,
        album_en: form.album_en,
        album_ar: form.album_ar,
        songwriter_en: form.songwriter_en,
        songwriter_ar: form.songwriter_ar,
        composer_en: form.composer_en,
        composer_ar: form.composer_ar,
        arranger_en: form.arranger_en,
        arranger_ar: form.arranger_ar,
        isrc: form.isrc,
        upc: form.upc,
        video_type: form.video_type,
        channel: form.channel,
        lyrics: form.lyrics || null,
      };
      const data = await apiFetch<FormatResult>('/api/video/format', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: String(e), title: '', description: '', tags: '', isrc: '', upc: '', video_type: form.video_type, channel: form.channel, has_lyrics: false });
    } finally {
      setGenerating(false);
    }
  };

  // ── Template live preview (client-side, A3) ──────────────────────────────
  const templateVars = useMemo<Record<string, string>>(() => ({
    artist_en:    form.artist_en,
    artist_ar:    form.artist_ar,
    song_en:      form.song_en,
    song_ar:      form.song_ar,
    album_en:     form.album_en,
    album_ar:     form.album_ar,
    upc:          form.upc,
    isrc:         form.isrc,
    release_date: '',
    writer_en:    form.songwriter_en,
    writer_ar:    form.songwriter_ar,
    composer_en:  form.composer_en,
    composer_ar:  form.composer_ar,
    arranger_en:  form.arranger_en,
    arranger_ar:  form.arranger_ar,
    genre: '', nationality: '', duration: '', track_number: '', track_count: '',
  }), [form]);

  const selectedTemplate = useMemo(
    () => pubTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [pubTemplates, selectedTemplateId],
  );
  const selectedPubChannel = useMemo(
    () => pubChannels.find((c) => c.id === selectedChannelId) ?? null,
    [pubChannels, selectedChannelId],
  );

  const tmplPreviewTitle = useMemo(
    () => selectedTemplate ? renderTemplate(selectedTemplate.title_template, templateVars) : '',
    [selectedTemplate, templateVars],
  );
  const tmplPreviewDesc = useMemo(() => {
    if (!selectedTemplate) return '';
    const parts: string[] = [];
    if (selectedPubChannel?.intro_text)     parts.push(renderTemplate(selectedPubChannel.intro_text, templateVars));
    if (selectedTemplate.description_template) parts.push(renderTemplate(selectedTemplate.description_template, templateVars));
    if (selectedPubChannel?.subscribe_text) parts.push(renderTemplate(selectedPubChannel.subscribe_text, templateVars));
    if (selectedPubChannel?.social_links) {
      const links = Object.entries(selectedPubChannel.social_links)
        .filter(([, url]) => url)
        .map(([p, u]) => `${p}: ${u}`)
        .join('\n');
      if (links) parts.push(links);
    }
    if (selectedPubChannel?.footer_text)    parts.push(renderTemplate(selectedPubChannel.footer_text, templateVars));
    return parts.filter(Boolean).join('\n\n');
  }, [selectedTemplate, selectedPubChannel, templateVars]);
  const tmplPreviewTags = useMemo(
    () => selectedTemplate ? renderTemplate(selectedTemplate.tags_template, templateVars) : '',
    [selectedTemplate, templateVars],
  );
  // ────────────────────────────────────────────────────────────────────────

  const canGenerate = form.artist_en.trim() && form.song_en.trim();

  const TABS = [
    { id: 'suite', label: 'Publishing Suite', icon: Zap },
    { id: 'credits', label: 'Credits Formatter', icon: BookOpen },
  ];

  return (
    <div className="max-w-screen-xl space-y-6">
      {/* ── Autofill banner ── */}
      {autofillBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-950/40 border border-green-800/50 text-green-400 text-sm">
          <Check className="w-4 h-4 shrink-0" />
          <span>Release autofilled: <strong>{autofillBanner}</strong></span>
          <button onClick={() => setAutofillBanner(null)} className="ml-auto text-green-700 hover:text-green-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Publishing Suite</h1>
          <p className="text-sm text-gray-500 mt-1">Enterprise release metadata generation & export</p>
        </div>
        <Link href="/tools/publishing/release-picker"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition">
          <Database className="w-4 h-4" /> Release Picker
        </Link>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-800/50">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${activeTab === id ? 'border-green-500 text-green-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'credits' && (
        <div className="rounded-xl border border-gray-800/50 bg-gray-950 p-6">
          <CreditsFormatterInline />
        </div>
      )}

      {activeTab === 'suite' && (
        <div className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-6">
          {/* ── LEFT COLUMN: Input ── */}
          <div className="space-y-5">
            {/* Source selector */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-900">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Input Source</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  {[{ id: 'manual', label: 'Manual', icon: Edit3 }, { id: 'picker', label: 'Release Picker', icon: Search }, { id: 'upc', label: 'UPC Lookup', icon: Hash }].map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => set('source', id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${form.source === id ? 'bg-gray-700 text-white border border-gray-600' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-900/50 border border-transparent'}`}>
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {form.source === 'picker' && <ReleasePicker onSelectPublishing={fillFromPublishingRecord} onSelectSheet={fillFromRelease} />}
                {form.source === 'upc' && <UPCLookup onSelect={fillFromRelease} />}
              </div>
            </div>

            {/* Release fields */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-900">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Release Metadata</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InputRow label="Artist (EN)" value={form.artist_en} onChange={(v) => set('artist_en', v)} placeholder="Artist Name" />
                  <InputRow label="Artist (AR)" value={form.artist_ar} onChange={(v) => set('artist_ar', v)} placeholder="اسم الفنان" rtl />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputRow label="Song (EN)" value={form.song_en} onChange={(v) => set('song_en', v)} placeholder="Song Title" />
                  <InputRow label="Song (AR)" value={form.song_ar} onChange={(v) => set('song_ar', v)} placeholder="اسم الأغنية" rtl />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputRow label="Album (EN)" value={form.album_en} onChange={(v) => set('album_en', v)} placeholder="Album Name" />
                  <InputRow label="Album (AR)" value={form.album_ar} onChange={(v) => set('album_ar', v)} placeholder="اسم الألبوم" rtl />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputRow label="UPC" value={form.upc} onChange={(v) => set('upc', v)} placeholder="UPC Code" />
                  <InputRow label="ISRC" value={form.isrc} onChange={(v) => set('isrc', v)} placeholder="ISRC Code" />
                </div>

                {/* Advanced toggle */}
                <button onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  Credits fields (songwriter, composer, arranger)
                </button>
                {showAdvanced && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <InputRow label="Songwriter (EN)" value={form.songwriter_en} onChange={(v) => set('songwriter_en', v)} />
                      <InputRow label="Songwriter (AR)" value={form.songwriter_ar} onChange={(v) => set('songwriter_ar', v)} rtl />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InputRow label="Composer (EN)" value={form.composer_en} onChange={(v) => set('composer_en', v)} />
                      <InputRow label="Composer (AR)" value={form.composer_ar} onChange={(v) => set('composer_ar', v)} rtl />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InputRow label="Arranger (EN)" value={form.arranger_en} onChange={(v) => set('arranger_en', v)} />
                      <InputRow label="Arranger (AR)" value={form.arranger_ar} onChange={(v) => set('arranger_ar', v)} rtl />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Video type */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-900">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Video Type</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {VIDEO_TYPES.map(({ id, label, icon: Icon, color }) => (
                  <button key={id} onClick={() => set('video_type', id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.video_type === id ? color : 'text-gray-600 border-gray-800 hover:text-gray-400'}`}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                {TEMPLATE_EXTRAS.map(({ id, label, note }) => (
                  <button key={id} title={note} onClick={() => {
                    if (id === 'Album' || id === 'EP') { set('video_type', 'Music Video'); }
                    if (id === 'Acoustic') set('song_en', form.song_en + (form.song_en ? ' (Acoustic)' : ''));
                    if (id === 'Remix') set('song_en', form.song_en + (form.song_en ? ' (Remix)' : ''));
                  }} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-800 text-gray-600 hover:text-gray-300 hover:border-gray-600 transition-all">
                    + {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-900">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Channel</p>
                <button onClick={() => setShowChannelMgr((v) => !v)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1">
                  <Settings className="w-3 h-3" /> Manage
                </button>
              </div>
              <div className="p-4 space-y-3">
                <select value={form.channel} onChange={(e) => set('channel', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none transition-colors">
                  {channels.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {showChannelMgr && <ChannelManager channels={channels} onUpdate={loadChannels} />}
              </div>
            </div>

            {/* Templates (A3) */}
            {pubTemplates.length > 0 && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-900">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-3.5 h-3.5 text-violet-400" />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Templates</p>
                  </div>
                  <Link href="/tools/publishing/templates" className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1">
                    <Settings className="w-3 h-3" /> Manage
                  </Link>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Description Template</label>
                    <select
                      value={selectedTemplateId ?? ''}
                      onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none transition-colors"
                    >
                      <option value="">— No template —</option>
                      {[...pubTemplates]
                        .sort((a, b) => {
                          const suggested = VIDEO_TYPE_TO_TEMPLATE[form.video_type];
                          if (a.type === suggested && b.type !== suggested) return -1;
                          if (b.type === suggested && a.type !== suggested) return 1;
                          return a.name.localeCompare(b.name);
                        })
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.type.replace(/_/g, ' ')})
                          </option>
                        ))}
                    </select>
                  </div>
                  {pubChannels.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Channel Template</label>
                      <select
                        value={selectedChannelId ?? ''}
                        onChange={(e) => setSelectedChannelId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none transition-colors"
                      >
                        <option value="">— No channel template —</option>
                        {pubChannels.map((c) => (
                          <option key={c.id} value={c.id}>{c.channel_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Lyrics */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-900">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Lyrics</p>
                  <span className="text-[10px] text-gray-700">(optional — for Lyrics Video type)</span>
                </div>
              </div>
              <div className="p-4">
                <textarea value={form.lyrics} onChange={(e) => set('lyrics', e.target.value)} rows={4} placeholder="Paste lyrics here…"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-300 font-mono placeholder-gray-700 focus:border-gray-600 focus:outline-none resize-none transition-colors" />
              </div>
            </div>

            {/* Generate Button */}
            <button onClick={generate} disabled={!canGenerate || generating}
              className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-40 bg-gradient-to-r from-green-700 to-emerald-600 hover:from-green-600 hover:to-emerald-500 text-white shadow-lg shadow-green-900/30">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Zap className="w-4 h-4" /> Generate Publishing Metadata</>}
            </button>
          </div>

          {/* ── RIGHT COLUMN: Output ── */}
          <div className="space-y-4">

            {/* Template Preview (A3) */}
            {selectedTemplate && (form.artist_en || form.song_en) && (
              <div className="rounded-xl border border-violet-900/40 bg-violet-950/10 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-violet-900/30">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-3.5 h-3.5 text-violet-400" />
                    <p className="text-xs font-bold text-violet-400/80 uppercase tracking-widest">Template Preview</p>
                    <span className="text-xs text-gray-600">{selectedTemplate.name}</span>
                  </div>
                  <button
                    onClick={() => setResult({
                      success: true,
                      title: tmplPreviewTitle,
                      description: tmplPreviewDesc,
                      tags: tmplPreviewTags,
                      isrc: form.isrc,
                      upc: form.upc,
                      video_type: form.video_type,
                      channel: form.channel,
                      has_lyrics: false,
                    })}
                    className="text-xs px-3 py-1 bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-600/30 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Eye className="w-3 h-3" /> Apply
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {tmplPreviewTitle && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">Title</p>
                      <p className="text-sm text-white bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 break-words">{tmplPreviewTitle}</p>
                    </div>
                  )}
                  {tmplPreviewDesc && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">Description</p>
                      <pre className="text-xs text-gray-300 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto font-sans leading-relaxed">{tmplPreviewDesc}</pre>
                    </div>
                  )}
                  {tmplPreviewTags && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">Tags</p>
                      <p className="text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 font-mono break-words">{tmplPreviewTags}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!result && !generating && (
              <div className="h-full flex flex-col items-center justify-center text-center py-20 rounded-xl border border-gray-800/30 bg-gray-950/30">
                <Zap className="w-10 h-10 text-gray-700 mb-4" />
                <p className="text-gray-600 text-sm font-medium">Fill in the release details and click Generate</p>
                <p className="text-gray-700 text-xs mt-2">Title · Description · Tags · Export will appear here</p>
              </div>
            )}
            {generating && (
              <div className="h-full flex flex-col items-center justify-center py-20 rounded-xl border border-gray-800/30 bg-gray-950/30">
                <Loader2 className="w-10 h-10 text-green-600 animate-spin mb-4" />
                <p className="text-gray-500 text-sm">Generating metadata…</p>
              </div>
            )}
            {result && !generating && (
              result.error ? (
                <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
                  <p className="text-red-400 text-sm font-semibold">Generation failed</p>
                  <p className="text-red-600 text-xs mt-1">{result.error}</p>
                </div>
              ) : (
                <OutputSection result={result} form={form} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline Credits Formatter (from existing component, simplified) ───────────

function CreditsFormatterInline() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const ARABIC_ROLES: Record<string, string> = {
    'كلمات': 'Lyrics',
    'كلمات وألحان': 'Lyrics & Music',
    'ألحان': 'Music',
    'توزيع': 'Arrangement',
    'هندسة صوت': 'Sound Engineering',
    'هندسة صوتية': 'Sound Engineering',
    'مكساج': 'Mixing',
    'ماسترينج': 'Mastering',
    'مزج وإتقان': 'Mixing & Mastering',
    'إخراج موسيقي': 'Musical Direction',
    'إنتاج': 'Production',
    'منتج': 'Producer',
    'غيتار': 'Guitar',
    'كيبورد': 'Keyboard',
    'عود': 'Oud',
    'قانون': 'Qanun',
    'ناي': 'Ney',
    'إيقاع': 'Percussion',
    'تصوير': 'Cinematography',
    'مونتاج': 'Editing',
    'إخراج': 'Direction',
  };

  const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

  const parse = () => {
    const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
    const blocks: { role: string; names: string[] }[] = [];
    let currentRole = '';
    let currentNames: string[] = [];

    for (const line of lines) {
      // Check if line is a role header (ends with : or is a known Arabic role)
      const isRole = line.endsWith(':') || Object.keys(ARABIC_ROLES).some((k) => line.startsWith(k));
      if (isRole) {
        if (currentRole && currentNames.length) blocks.push({ role: currentRole, names: [...currentNames] });
        currentRole = line.replace(/:$/, '').trim();
        currentNames = [];
      } else {
        currentNames.push(line);
      }
    }
    if (currentRole && currentNames.length) blocks.push({ role: currentRole, names: [...currentNames] });

    const result = blocks.map(({ role, names }) => {
      const enRole = ARABIC_ROLES[role] || role;
      const roleStr = isArabic(role) ? `${enRole} :` : `${role} :`;
      const nameStr = names.map((n) => {
        if (isArabic(n)) return `${n}`;
        return n;
      }).join('\n');
      return `✶ ${roleStr}\n${nameStr}`;
    }).join('\n\n');

    setOutput(result);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Paste Arabic/mixed credits below. The formatter will detect roles, transliterate, and structure them into publishing format.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Raw Credits Input</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={14} placeholder={"هندسة صوت:\nسهم\nمحمد عصمت\n\nتوزيع:\nأحمد الحوساوي"}
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white font-mono placeholder-gray-700 focus:border-gray-600 focus:outline-none resize-none transition-colors" dir="rtl" />
          <button onClick={parse} className="mt-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all">
            Format Credits
          </button>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest">Formatted Output</label>
            {output && <CopyButton text={output} />}
          </div>
          <pre className="w-full min-h-[14rem] px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-green-400 font-mono whitespace-pre-wrap break-words overflow-y-auto">
            {output || '(formatted credits will appear here)'}
          </pre>
        </div>
      </div>
    </div>
  );
}
