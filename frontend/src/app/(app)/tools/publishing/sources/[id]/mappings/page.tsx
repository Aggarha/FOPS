'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Map, Plus, Edit2, Trash2, Copy, TestTube2, Loader2,
  X, RefreshCw, ChevronRight, CheckCircle, AlertTriangle,
  ArrowRight, GripVertical,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface CanonicalField {
  key: string;
  label: string;
  hint: string;
}

interface ColumnMapping {
  id: number;
  uid: string;
  source_id: number | null;
  tenant_id: string;
  mapping_name: string;
  mappings: Record<string, string>;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Source {
  id: number;
  source_name: string;
  file_name: string | null;
  has_file: boolean;
}

export default function MappingsPage() {
  const params = useParams();
  const sourceId = Number(params.id);

  const [source, setSource] = useState<Source | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editMapping, setEditMapping] = useState<ColumnMapping | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ColumnMapping | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; data: any } | null>(null);
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [srcData, mapData, fieldData] = await Promise.all([
        apiFetch(`/api/publishing/sources/${sourceId}`),
        apiFetch(`/api/publishing/mappings?source_id=${sourceId}`),
        apiFetch('/api/publishing/canonical-fields'),
      ]);
      setSource(srcData.source);
      setMappings(mapData.mappings ?? []);
      setCanonicalFields(fieldData.fields ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [sourceId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (m: ColumnMapping) => {
    setActionLoading(m.id);
    try {
      await apiFetch(`/api/publishing/mappings/${m.id}`, { method: 'DELETE' });
      setMappings(x => x.filter(v => v.id !== m.id));
      setDeleteConfirm(null);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleClone = async (m: ColumnMapping) => {
    setActionLoading(m.id);
    try {
      const d = await apiFetch(`/api/publishing/mappings/${m.id}/clone`, { method: 'POST' });
      setMappings(x => [d.mapping, ...x]);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleTest = async (m: ColumnMapping) => {
    if (!source?.has_file) return;
    setTestLoading(m.id);
    setTestResult(null);
    try {
      const d = await apiFetch(`/api/publishing/mappings/${m.id}/test?source_id=${sourceId}`, { method: 'POST' });
      setTestResult({ id: m.id, data: d });
    } catch { /* ignore */ }
    finally { setTestLoading(null); }
  };

  const fieldCount = (m: ColumnMapping) => Object.keys(m.mappings).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1 flex-wrap">
            <Link href="/tools/publishing" className="hover:text-gray-400 transition">Publishing Suite</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/tools/publishing/sources" className="hover:text-gray-400 transition">Sources</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-400">{source?.source_name ?? `Source #${sourceId}`}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-300">Mappings</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Column Mappings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Map raw column names to canonical fields for{' '}
            <span className="text-gray-300">{source?.source_name ?? '...'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); load(); }}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-sm transition">
            <Plus className="w-4 h-4" /> New Mapping
          </button>
        </div>
      </div>

      {/* Source file status banner */}
      {source && !source.has_file && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-900/20 border border-yellow-700/30 text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This source has no file uploaded. Upload a file to test mappings.
          <Link href="/tools/publishing/sources" className="ml-auto underline text-yellow-300 text-xs hover:text-yellow-200">
            Go to Sources
          </Link>
        </div>
      )}

      {/* Canonical fields reference */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Canonical Fields Reference</p>
        <div className="flex flex-wrap gap-1.5">
          {canonicalFields.map(f => (
            <div key={f.key} className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-900 border border-gray-800 text-[10px]">
              <span className="text-gray-300 font-bold">{f.label}</span>
              <span className="text-gray-700">→</span>
              <span className="text-gray-600 font-mono">{f.key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mappings list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-gray-700 animate-spin" /></div>
      ) : mappings.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl text-gray-700">
          <Map className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No mappings yet</p>
          <p className="text-xs mt-1">Create a mapping to link raw column names to canonical fields</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mappings.map((m) => (
            <div key={m.id} className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0">
                  <Map className="w-4 h-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{m.mapping_name}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {fieldCount(m)} field{fieldCount(m) !== 1 ? 's' : ''} mapped
                    {m.created_by && ` · by ${m.created_by}`}
                    {m.created_at && ` · ${new Date(m.created_at).toLocaleDateString()}`}
                  </p>
                  {/* Mapping pills */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(m.mappings).slice(0, 8).map(([canon, raw]) => (
                      <div key={canon} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-[9px]">
                        <span className="text-yellow-400 font-bold">{canon}</span>
                        <ArrowRight className="w-2 h-2 text-gray-700" />
                        <span className="text-gray-400 font-mono">{raw}</span>
                      </div>
                    ))}
                    {fieldCount(m) > 8 && (
                      <span className="text-[9px] text-gray-600 px-2 py-0.5">+{fieldCount(m) - 8} more</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Test */}
                  <button onClick={() => handleTest(m)} disabled={!source?.has_file || testLoading === m.id}
                    title="Test mapping against source file"
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-purple-800/50 text-gray-400 hover:text-purple-400 transition disabled:opacity-40">
                    {testLoading === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                  </button>
                  {/* Clone */}
                  <button onClick={() => handleClone(m)} disabled={actionLoading === m.id}
                    title="Clone mapping"
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-40">
                    {actionLoading === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {/* Edit */}
                  <button onClick={() => setEditMapping(m)}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {/* Delete */}
                  <button onClick={() => setDeleteConfirm(m)}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-800/50 text-gray-400 hover:text-red-400 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testResult?.id === m.id && (
                <div className="mt-4 rounded-lg bg-gray-900 border border-gray-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Mapping Preview
                    </p>
                    <button onClick={() => setTestResult(null)} className="text-gray-600 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-[10px] text-gray-600">Raw headers: {testResult.data.raw_headers?.join(', ')}</p>
                  {testResult.data.mapped_preview?.slice(0, 3).map((row: any, i: number) => (
                    <div key={i} className="text-[10px] text-gray-500 font-mono bg-gray-950 rounded p-2">
                      {Object.entries(row).filter(([, v]) => v).slice(0, 6).map(([k, v]) => (
                        <span key={k} className="mr-3">
                          <span className="text-yellow-500">{k}</span>: <span className="text-gray-300">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {(showCreate || editMapping) && (
        <MappingFormModal
          mapping={editMapping}
          sourceId={sourceId}
          canonicalFields={canonicalFields}
          fileHeaders={source?.has_file ? [] : []}
          onClose={() => { setShowCreate(false); setEditMapping(null); }}
          onSaved={(saved) => {
            if (editMapping) {
              setMappings(x => x.map(v => v.id === saved.id ? saved : v));
            } else {
              setMappings(x => [saved, ...x]);
            }
            setShowCreate(false);
            setEditMapping(null);
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-red-900/50 p-6 shadow-2xl space-y-4">
            <p className="text-white font-bold">Delete "{deleteConfirm.mapping_name}"?</p>
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

function MappingFormModal({
  mapping, sourceId, canonicalFields, fileHeaders, onClose, onSaved,
}: {
  mapping: ColumnMapping | null;
  sourceId: number;
  canonicalFields: CanonicalField[];
  fileHeaders: string[];
  onClose: () => void;
  onSaved: (m: ColumnMapping) => void;
}) {
  const [name, setName] = useState(mapping?.mapping_name ?? '');
  // mappings state: { canonical_key: raw_col_name }
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>(
    mapping
      ? Object.entries(mapping.mappings).map(([k, v]) => ({ key: k, value: v }))
      : canonicalFields.map(f => ({ key: f.key, value: '' }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateRow = (idx: number, value: string) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, value } : row));
  };

  const buildMappings = () => {
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.value.trim()) result[row.key] = row.value.trim();
    }
    return result;
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const built = buildMappings();
    if (Object.keys(built).length === 0) {
      setError('At least one field mapping is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let d: any;
      if (mapping) {
        d = await apiFetch(`/api/publishing/mappings/${mapping.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping_name: name.trim(), mappings: built }),
        });
      } else {
        d = await apiFetch('/api/publishing/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping_name: name.trim(), source_id: sourceId, mappings: built }),
        });
      }
      onSaved(d.mapping);
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold text-white">{mapping ? 'Edit Mapping' : 'New Column Mapping'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handle} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5">Mapping Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Rotana Standard Format"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-yellow-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-400">Field Mappings</label>
              <p className="text-[10px] text-gray-600">Canonical Field → Raw Column Name in your file</p>
            </div>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <div className="grid grid-cols-2 gap-0 bg-gray-800/50 px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-700">
                <span>Canonical Field</span>
                <span>Raw Column Name</span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-800/50">
                {rows.map((row, idx) => {
                  const fieldMeta = canonicalFields.find(f => f.key === row.key);
                  return (
                    <div key={row.key} className="grid grid-cols-2 gap-0 items-center">
                      <div className="px-3 py-2 bg-gray-900 border-r border-gray-800">
                        <p className="text-xs font-bold text-gray-300">{fieldMeta?.label ?? row.key}</p>
                        <p className="text-[9px] text-gray-700 font-mono mt-0.5">{row.key}</p>
                      </div>
                      <div className="px-2 py-1.5 bg-gray-950">
                        <input
                          value={row.value}
                          onChange={e => updateRow(idx, e.target.value)}
                          placeholder={fieldMeta?.hint ?? ''}
                          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-800 text-gray-300 text-xs placeholder-gray-700 focus:outline-none focus:border-yellow-700"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-gray-700 mt-1">Leave blank to skip a field. Only filled fields are saved.</p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-sm transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-sm disabled:opacity-40 transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mapping ? 'Save Changes' : 'Create Mapping'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
