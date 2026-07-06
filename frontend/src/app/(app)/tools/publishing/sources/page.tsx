'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Database, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Upload, TestTube2, Loader2, X, RefreshCw, File,
  CheckCircle, AlertTriangle, ChevronRight, Map,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8001';

interface Source {
  id: number;
  uid: string;
  tenant_id: string;
  source_name: string;
  source_type: string;
  file_name: string | null;
  has_file: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const SOURCE_TYPES = [
  { value: 'metadata', label: 'Metadata Sheet' },
  { value: 'credits',  label: 'Credits Sheet' },
  { value: 'combined', label: 'Combined Sheet' },
  { value: 'other',    label: 'Other' },
];

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    metadata: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    credits:  'bg-purple-500/10 text-purple-400 border-purple-500/30',
    combined: 'bg-green-500/10 text-green-400 border-green-500/30',
    other:    'bg-gray-500/10 text-gray-400 border-gray-500/30',
  };
  const label = SOURCE_TYPES.find(s => s.value === type)?.label ?? type;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg[type] ?? cfg.other}`}>
      {label}
    </span>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editSource, setEditSource] = useState<Source | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; data: any } | null>(null);
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Source | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/api/publishing/sources');
      setSources(d.sources ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (src: Source) => {
    setActionLoading(src.id);
    try {
      await apiFetch(`/api/publishing/sources/${src.id}`, { method: 'DELETE' });
      setSources(s => s.filter(x => x.id !== src.id));
      setDeleteConfirm(null);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleToggle = async (src: Source) => {
    setActionLoading(src.id);
    try {
      const d = await apiFetch(`/api/publishing/sources/${src.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !src.active }),
      });
      setSources(s => s.map(x => x.id === src.id ? d.source : x));
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleUpload = async (sourceId: number, file: File) => {
    setUploadingFor(sourceId);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/publishing/sources/${sourceId}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Upload failed');
      setSources(s => s.map(x => x.id === sourceId ? d.source : x));
    } catch { /* ignore */ }
    finally { setUploadingFor(null); }
  };

  const handleTest = async (src: Source) => {
    if (!src.has_file) return;
    setTestLoading(src.id);
    setTestResult(null);
    try {
      const d = await apiFetch(`/api/publishing/sources/${src.id}/test`, { method: 'POST' });
      setTestResult({ id: src.id, data: d });
    } catch { /* ignore */ }
    finally { setTestLoading(null); }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={uploadRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && uploadingFor !== null) handleUpload(uploadingFor, f);
          if (uploadRef.current) uploadRef.current.value = '';
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
            <Link href="/tools/publishing" className="hover:text-gray-400 transition">Publishing Suite</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-400">Sources</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Source Library</h1>
          <p className="text-sm text-gray-500 mt-1">Register and manage metadata source files per tenant</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); load(); }}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-sm transition">
            <Plus className="w-4 h-4" /> Add Source
          </button>
        </div>
      </div>

      {/* Source list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-gray-700 animate-spin" /></div>
      ) : sources.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl text-gray-700">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No sources registered</p>
          <p className="text-xs mt-1">Add your first metadata source to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((src) => (
            <div key={src.id}
              className={`rounded-xl border bg-gray-950 p-4 transition-all ${src.active ? 'border-gray-800' : 'border-gray-800/40 opacity-60'}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white">{src.source_name}</p>
                    <TypeBadge type={src.source_type} />
                    {!src.active && (
                      <span className="text-[9px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {src.has_file ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-500">
                        <CheckCircle className="w-3 h-3" /> {src.file_name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-yellow-600">
                        <AlertTriangle className="w-3 h-3" /> No file uploaded
                      </span>
                    )}
                    <span className="text-[10px] text-gray-700">by {src.created_by}</span>
                    {src.created_at && (
                      <span className="text-[10px] text-gray-700">{new Date(src.created_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {/* Upload */}
                  <button
                    onClick={() => { setUploadingFor(src.id); setTimeout(() => uploadRef.current?.click(), 50); }}
                    disabled={uploadingFor === src.id}
                    title="Upload / Replace File"
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-blue-800/50 text-gray-400 hover:text-blue-400 transition disabled:opacity-40"
                  >
                    {uploadingFor === src.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  </button>

                  {/* Test */}
                  <button
                    onClick={() => handleTest(src)}
                    disabled={!src.has_file || testLoading === src.id}
                    title="Test Source (preview rows)"
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-purple-800/50 text-gray-400 hover:text-purple-400 transition disabled:opacity-40"
                  >
                    {testLoading === src.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                  </button>

                  {/* Mappings */}
                  <Link href={`/tools/publishing/sources/${src.id}/mappings`}
                    title="Manage Column Mappings"
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-yellow-800/50 text-gray-400 hover:text-yellow-400 transition">
                    <Map className="w-3.5 h-3.5" />
                  </Link>

                  {/* Edit */}
                  <button
                    onClick={() => setEditSource(src)}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Enable/Disable toggle */}
                  <button
                    onClick={() => handleToggle(src)}
                    disabled={actionLoading === src.id}
                    title={src.active ? 'Disable' : 'Enable'}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-40"
                  >
                    {actionLoading === src.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : src.active
                        ? <ToggleRight className="w-3.5 h-3.5 text-green-400" />
                        : <ToggleLeft className="w-3.5 h-3.5" />
                    }
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirm(src)}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-800/50 text-gray-400 hover:text-red-400 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result inline */}
              {testResult?.id === src.id && (
                <div className="mt-4 rounded-lg bg-gray-900 border border-gray-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {testResult.data.row_count} rows previewed — {testResult.data.headers?.length ?? 0} columns detected
                    </p>
                    <button onClick={() => setTestResult(null)} className="text-gray-600 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {testResult.data.headers?.map((h: string) => (
                      <span key={h} className="px-2 py-0.5 rounded-full text-[9px] bg-gray-800 text-gray-400 border border-gray-700">{h}</span>
                    ))}
                  </div>
                  {testResult.data.preview?.slice(0, 2).map((row: any, i: number) => (
                    <div key={i} className="text-[10px] text-gray-600 font-mono bg-gray-950 rounded p-2 truncate">
                      {Object.entries(row).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {(showCreate || editSource) && (
        <SourceFormModal
          source={editSource}
          onClose={() => { setShowCreate(false); setEditSource(null); }}
          onSaved={(s) => {
            if (editSource) {
              setSources(x => x.map(v => v.id === s.id ? s : v));
            } else {
              setSources(x => [s, ...x]);
            }
            setShowCreate(false);
            setEditSource(null);
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-red-900/50 p-6 shadow-2xl space-y-4">
            <p className="text-white font-bold">Delete "{deleteConfirm.source_name}"?</p>
            <p className="text-xs text-gray-500">This will permanently delete the source and its uploaded file. Import records will also be removed.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-sm transition">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={actionLoading === deleteConfirm.id}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-40 transition">
                {actionLoading === deleteConfirm.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceFormModal({
  source, onClose, onSaved,
}: {
  source: Source | null;
  onClose: () => void;
  onSaved: (s: Source) => void;
}) {
  const [name, setName] = useState(source?.source_name ?? '');
  const [type, setType] = useState(source?.source_type ?? 'metadata');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      let d: any;
      if (source) {
        d = await apiFetch(`/api/publishing/sources/${source.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_name: name.trim(), source_type: type }),
        });
      } else {
        d = await apiFetch('/api/publishing/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_name: name.trim(), source_type: type }),
        });
      }
      onSaved(d.source);
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">{source ? 'Edit Source' : 'Add Source'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handle} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5">Source Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Rotana Metadata Sheet"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5">Source Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-green-600">
              {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-sm transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-sm disabled:opacity-40 transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {source ? 'Save Changes' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
