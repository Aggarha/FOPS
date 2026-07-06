'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image, Film, FileText, File, Upload, Trash2, Download, Search,
  RefreshCw, Loader2, X, Tag, Link2, Plus, Filter,
} from 'lucide-react';
import { apiFetch, authenticatedFetch } from '@/lib/api';
import { buildApiUrl } from '@/lib/runtime';
import { useAuth } from '@/context/AuthContext';

interface Asset {
  id: number;
  uid: string;
  name: string;
  type: 'artwork' | 'motion' | 'lyrics' | 'other';
  mime_type: string | null;
  size: number | null;
  upc: string | null;
  version: number;
  notes: string | null;
  tags: string[];
  filename: string;
  uploaded_by: string | null;
  download_url: string;
  created_at: string | null;
}

const TYPE_META = {
  artwork: { label: 'Artwork',  icon: Image,    color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/30',   accept: '.jpg,.jpeg,.png,.webp,.tiff' },
  motion:  { label: 'Motion',   icon: Film,     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   accept: '.mp4,.mov,.webm,.avi' },
  lyrics:  { label: 'Lyrics',   icon: FileText, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', accept: '.txt,.pdf,.docx,.lrc' },
  other:   { label: 'Other',    icon: File,     color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   accept: '*' },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function AssetCard({ asset, onDelete, isAdmin }: {
  asset: Asset; onDelete: (uid: string) => void; isAdmin: boolean;
}) {
  const meta = TYPE_META[asset.type] || TYPE_META.other;
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 flex flex-col gap-3 transition-all hover:opacity-90`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gray-900 border border-gray-800 shrink-0 ${meta.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex gap-1">
          <a href={buildApiUrl(asset.download_url)}
            target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition">
            <Download className="w-3.5 h-3.5" />
          </a>
          {isAdmin && (
            <button onClick={() => onDelete(asset.uid)}
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-800/50 text-gray-400 hover:text-red-400 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="font-bold text-white text-sm leading-tight truncate">{asset.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
            {meta.label}
          </span>
          {asset.upc && (
            <span className="flex items-center gap-1 text-[9px] text-gray-600">
              <Link2 className="w-2.5 h-2.5" /> {asset.upc}
            </span>
          )}
          {asset.size != null && (
            <span className="text-[9px] text-gray-700">{formatBytes(asset.size)}</span>
          )}
        </div>
      </div>

      {asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {asset.tags.slice(0, 4).map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded-full text-[9px] bg-gray-800 text-gray-500 border border-gray-700">
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="text-[9px] text-gray-700">
        {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : ''} — {asset.uploaded_by}
      </p>
    </div>
  );
}

export default function AssetsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterUpc, setFilterUpc] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Upload form state
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upName, setUpName] = useState('');
  const [upType, setUpType] = useState<string>('other');
  const [upUpc, setUpUpc] = useState('');
  const [upNotes, setUpNotes] = useState('');
  const [upTags, setUpTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [upError, setUpError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterUpc) params.set('upc', filterUpc);
      if (q) params.set('q', q);
      const data = await apiFetch(`/api/assets?${params}`);
      setAssets(data.assets ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterType, filterUpc, q]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (uid: string) => {
    if (!confirm('Delete this asset?')) return;
    setDeleting(uid);
    try {
      await apiFetch(`/api/assets/${uid}`, { method: 'DELETE' });
      setAssets((a) => a.filter((x) => x.uid !== uid));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upFile || !upName.trim()) return;
    setUploading(true);
    setUpError('');
    try {
      const form = new FormData();
      form.append('file', upFile);
      form.append('name', upName);
      form.append('type', upType);
      if (upUpc.trim()) form.append('upc', upUpc.trim());
      if (upNotes.trim()) form.append('notes', upNotes.trim());
      if (upTags.trim()) form.append('tags', JSON.stringify(upTags.split(',').map((t) => t.trim()).filter(Boolean)));

      const res = await authenticatedFetch('/api/assets', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setAssets((a) => [data.asset, ...a]);
      setShowUpload(false);
      setUpFile(null); setUpName(''); setUpType('other'); setUpUpc(''); setUpNotes(''); setUpTags('');
    } catch (err: any) {
      setUpError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const counts = { all: assets.length, ...Object.fromEntries(Object.keys(TYPE_META).map((t) => [t, assets.filter((a) => a.type === t).length])) };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Asset Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Artwork, motion graphics, lyrics & release assets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); load(); }}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition">
            <Upload className="w-4 h-4" /> Upload Asset
          </button>
        </div>
      </div>

      {/* Type filter strip */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${!filterType ? 'bg-indigo-700 text-white border-indigo-600' : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600'}`}>
          All ({counts.all})
        </button>
        {Object.entries(TYPE_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const count = (counts as any)[key] ?? 0;
          return (
            <button key={key} onClick={() => setFilterType(filterType === key ? '' : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filterType === key ? `${meta.bg} ${meta.color} ${meta.border}` : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600'}`}>
              <Icon className="w-3 h-3" /> {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search + UPC filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search asset name..."
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input value={filterUpc} onChange={(e) => setFilterUpc(e.target.value)}
            placeholder="Filter by UPC..."
            className="pl-8 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500 w-44"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-gray-700 animate-spin" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20 text-gray-700">
          <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No assets found</p>
          <p className="text-xs mt-1">Upload your first asset to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((a) => (
            <AssetCard key={a.uid} asset={a} onDelete={handleDelete} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700/50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Upload Asset</h2>
              </div>
              <button onClick={() => setShowUpload(false)} className="text-gray-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="p-5 space-y-3">
              {/* File pick */}
              <div
                onClick={() => fileRef.current?.click()}
                className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition ${upFile ? 'border-indigo-600 bg-indigo-900/10' : 'border-gray-700 hover:border-gray-500'}`}>
                <input ref={fileRef} type="file" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUpFile(f);
                      if (!upName) setUpName(f.name.replace(/\.[^.]+$/, ''));
                      // Auto-detect type
                      const ext = f.name.split('.').pop()?.toLowerCase();
                      if (['jpg','jpeg','png','webp','tiff','gif'].includes(ext!)) setUpType('artwork');
                      else if (['mp4','mov','avi','webm','mkv'].includes(ext!)) setUpType('motion');
                      else if (['txt','pdf','docx','lrc'].includes(ext!)) setUpType('lyrics');
                      else setUpType('other');
                    }
                  }}
                />
                {upFile ? (
                  <p className="text-sm text-indigo-300 font-medium">{upFile.name} ({formatBytes(upFile.size)})</p>
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Click to select a file</p>
                  </>
                )}
              </div>

              <input required value={upName} onChange={(e) => setUpName(e.target.value)}
                placeholder="Asset name *"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
              />

              <select value={upType} onChange={(e) => setUpType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-gray-500">
                {Object.entries(TYPE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>

              <input value={upUpc} onChange={(e) => setUpUpc(e.target.value)}
                placeholder="Link to UPC (optional)"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
              />

              <input value={upTags} onChange={(e) => setUpTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
              />

              <textarea value={upNotes} onChange={(e) => setUpNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
              />

              {upError && <p className="text-xs text-red-400">{upError}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-sm transition">
                  Cancel
                </button>
                <button type="submit" disabled={uploading || !upFile}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-40 transition">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
