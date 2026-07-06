'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import {
  Plus, Edit, Trash2, Copy, ChevronDown, ChevronRight,
  LayoutTemplate, Eye, EyeOff, Info, X, Check, Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface PublishingTemplate {
  id: number;
  uid: string;
  name: string;
  type: string;
  title_template: string;
  description_template: string;
  tags_template: string;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  'single', 'album', 'ep', 'music_video', 'lyrics_video',
  'concert', 'acoustic', 'remix', 'visualizer',
];

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  single:       { label: 'Single',       color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  album:        { label: 'Album',        color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  ep:           { label: 'EP',           color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  music_video:  { label: 'Music Video',  color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  lyrics_video: { label: 'Lyrics Video', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  concert:      { label: 'Concert',      color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  acoustic:     { label: 'Acoustic',     color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  remix:        { label: 'Remix',        color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  visualizer:   { label: 'Visualizer',   color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
};

const TEMPLATE_VARIABLES = [
  { key: 'artist_en',    label: 'Artist Name (English)' },
  { key: 'artist_ar',    label: 'Artist Name (Arabic)' },
  { key: 'song_en',      label: 'Song Title (English)' },
  { key: 'song_ar',      label: 'Song Title (Arabic)' },
  { key: 'album_en',     label: 'Album Name (English)' },
  { key: 'album_ar',     label: 'Album Name (Arabic)' },
  { key: 'upc',          label: 'UPC / Barcode' },
  { key: 'isrc',         label: 'ISRC Code' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'writer_en',    label: 'Songwriter (English)' },
  { key: 'writer_ar',    label: 'Songwriter (Arabic)' },
  { key: 'composer_en',  label: 'Composer (English)' },
  { key: 'composer_ar',  label: 'Composer (Arabic)' },
  { key: 'arranger_en',  label: 'Arranger (English)' },
  { key: 'arranger_ar',  label: 'Arranger (Arabic)' },
  { key: 'genre',        label: 'Genre' },
  { key: 'nationality',  label: 'Nationality' },
  { key: 'duration',     label: 'Duration' },
  { key: 'track_number', label: 'Track Number' },
  { key: 'track_count',  label: 'Total Tracks' },
];

const SAMPLE_VARS: Record<string, string> = {
  artist_en:    'Artist Name',
  artist_ar:    'اسم الفنان',
  song_en:      'Song Title',
  song_ar:      'اسم الأغنية',
  album_en:     'Album Name',
  album_ar:     'اسم الألبوم',
  upc:          '123456789012',
  isrc:         'USRC12345678',
  release_date: '2024-01-01',
  writer_en:    'Songwriter Name',
  writer_ar:    'كاتب الأغنية',
  composer_en:  'Composer Name',
  composer_ar:  'اسم الملحن',
  arranger_en:  'Arranger Name',
  arranger_ar:  'اسم الموزع',
  genre:        'Arabic Pop',
  nationality:  'Saudi',
  duration:     '3:45',
  track_number: '1',
  track_count:  '12',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function typeLabel(type: string): string {
  return TYPE_CONFIG[type]?.label ?? type;
}
function typeBadge(type: string): string {
  return TYPE_CONFIG[type]?.color ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30';
}

// ── Empty form ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  type: 'single',
  title_template: '',
  description_template: '',
  tags_template: '',
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function TemplatesPage() {
  const [templates, setTemplates]         = useState<PublishingTemplate[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterType, setFilterType]       = useState<string>('all');
  const [showModal, setShowModal]         = useState(false);
  const [editTarget, setEditTarget]       = useState<PublishingTemplate | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<PublishingTemplate | null>(null);
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [form, setForm]                   = useState({ ...EMPTY_FORM });
  const [showVars, setShowVars]           = useState(false);
  const [error, setError]                 = useState('');
  const [successMsg, setSuccessMsg]       = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/publishing/templates');
      if (res.success) setTemplates(res.templates);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    if (filterType === 'all') return templates;
    return templates.filter((t) => t.type === filterType);
  }, [templates, filterType]);

  // ── Modal helpers ────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setShowModal(true);
  }

  function openEdit(t: PublishingTemplate) {
    setEditTarget(t);
    setForm({
      name:                 t.name,
      type:                 t.type,
      title_template:       t.title_template,
      description_template: t.description_template,
      tags_template:        t.tags_template,
    });
    setError('');
    setShowModal(true);
  }

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await apiFetch(`/api/publishing/templates/${editTarget.id}`, {
          method: 'PATCH', body: JSON.stringify(form),
        });
        flash('Template updated');
      } else {
        await apiFetch('/api/publishing/templates', {
          method: 'POST', body: JSON.stringify(form),
        });
        flash('Template created');
      }
      setShowModal(false);
      fetchTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/publishing/templates/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      flash('Template deleted');
      fetchTemplates();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  // ── Clone ────────────────────────────────────────────────────────────────

  async function handleClone(t: PublishingTemplate) {
    try {
      await apiFetch(`/api/publishing/templates/${t.id}/clone`, { method: 'POST' });
      flash(`Cloned "${t.name}"`);
      fetchTemplates();
    } catch {
      /* ignore */
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────

  async function toggleActive(t: PublishingTemplate) {
    try {
      await apiFetch(`/api/publishing/templates/${t.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !t.active }),
      });
      fetchTemplates();
    } catch {
      /* ignore */
    }
  }

  // ── Live preview (modal) ─────────────────────────────────────────────────

  const previewTitle       = renderTemplate(form.title_template,       SAMPLE_VARS);
  const previewDescription = renderTemplate(form.description_template, SAMPLE_VARS);
  const previewTags        = renderTemplate(form.tags_template,        SAMPLE_VARS);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2">
        <Link href="/tools/publishing" className="hover:text-gray-300 transition-colors">Publishing Suite</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-300">Template Library</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <LayoutTemplate className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Template Library</h1>
            <p className="text-sm text-gray-400">Title / description / tag templates for all release types</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Success flash */}
      {successMsg && (
        <div className="mb-4 px-4 py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {successMsg}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', ...TEMPLATE_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              filterType === t
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'all' ? 'All Types' : typeLabel(t)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium text-gray-400">No templates yet</p>
          <p className="text-sm">Create a template to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => openEdit(t)}
              onClone={() => handleClone(t)}
              onDelete={() => setDeleteTarget(t)}
              onToggle={() => toggleActive(t)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <TemplateModal
          editTarget={editTarget}
          form={form}
          setForm={setForm}
          saving={saving}
          error={error}
          showVars={showVars}
          setShowVars={setShowVars}
          previewTitle={previewTitle}
          previewDescription={previewDescription}
          previewTags={previewTags}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────

function TemplateCard({
  template, onEdit, onClone, onDelete, onToggle,
}: {
  template: PublishingTemplate;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`bg-gray-900 border rounded-xl p-5 transition-all ${
      template.active
        ? 'border-gray-700/60 hover:border-gray-600'
        : 'border-gray-800 opacity-60'
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-white text-sm leading-snug">{template.name}</h3>
          {template.created_by && (
            <p className="text-xs text-gray-500 mt-0.5">by {template.created_by}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ml-2 shrink-0 ${typeBadge(template.type)}`}>
          {typeLabel(template.type)}
        </span>
      </div>

      {/* Title preview */}
      {template.title_template && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-1 font-mono bg-gray-800/50 px-2 py-1 rounded">
          {template.title_template}
        </p>
      )}

      {/* Status + actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            template.active
              ? 'text-green-400 hover:text-green-300'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          {template.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {template.active ? 'Active' : 'Inactive'}
        </button>
        <div className="flex items-center gap-1">
          <IconBtn icon={<Edit className="w-3.5 h-3.5" />} title="Edit" onClick={onEdit} />
          <IconBtn icon={<Copy className="w-3.5 h-3.5" />} title="Clone" onClick={onClone} />
          <IconBtn icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" onClick={onDelete} danger />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon, title, onClick, danger }: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        danger
          ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
      }`}
    >
      {icon}
    </button>
  );
}

// ── Template Modal ────────────────────────────────────────────────────────

function TemplateModal({
  editTarget, form, setForm, saving, error, showVars, setShowVars,
  previewTitle, previewDescription, previewTags,
  onSave, onClose,
}: {
  editTarget: PublishingTemplate | null;
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  saving: boolean;
  error: string;
  showVars: boolean;
  setShowVars: React.Dispatch<React.SetStateAction<boolean>>;
  previewTitle: string;
  previewDescription: string;
  previewTags: string;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  function field(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl my-8 shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-violet-400" />
            {editTarget ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left column: form ─────────────────────────────────────────── */}
          <div className="space-y-4">

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            {/* Name + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Template Name *</label>
                <input
                  value={form.name} onChange={field('name')} required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="e.g. Standard Music Video"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Type</label>
                <select
                  value={form.type} onChange={field('type')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t} value={t}>{typeLabel(t)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Title template */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Title Template</label>
              <input
                value={form.title_template} onChange={field('title_template')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="{{song_en}} | {{artist_en}} (Official Video)"
              />
            </div>

            {/* Description template */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Description Template</label>
              <textarea
                value={form.description_template} onChange={field('description_template')}
                rows={7}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-violet-500 transition-colors resize-none"
                placeholder={"{{song_en}} — {{artist_en}}\n\nWritten by {{writer_en}}\nComposed by {{composer_en}}"}
              />
            </div>

            {/* Tags template */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Tags Template</label>
              <input
                value={form.tags_template} onChange={field('tags_template')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="{{artist_en}}, {{song_en}}, {{genre}}"
              />
            </div>

            {/* Variable reference */}
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowVars((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-800 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> Available Variables
                </span>
                {showVars ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {showVars && (
                <div className="p-3 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto bg-gray-800/30">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <div key={v.key} className="flex items-baseline gap-1">
                      <code className="text-violet-400 text-xs font-mono shrink-0">{`{{${v.key}}}`}</code>
                      <span className="text-gray-500 text-xs truncate">{v.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: live preview ────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Live Preview
                <span className="text-gray-600 font-normal normal-case ml-1">(sample data)</span>
              </h3>

              <div className="space-y-4">
                {/* Rendered title */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Title</p>
                  <p className={`text-sm rounded-lg px-3 py-2 border ${
                    previewTitle
                      ? 'bg-gray-800 border-gray-700 text-white'
                      : 'bg-gray-800/30 border-gray-800 text-gray-600 italic'
                  }`}>
                    {previewTitle || 'Title template empty'}
                  </p>
                </div>

                {/* Rendered description */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Description</p>
                  <pre className={`text-xs rounded-lg px-3 py-2 border whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-sans leading-relaxed ${
                    previewDescription
                      ? 'bg-gray-800 border-gray-700 text-gray-200'
                      : 'bg-gray-800/30 border-gray-800 text-gray-600 italic'
                  }`}>
                    {previewDescription || 'Description template empty'}
                  </pre>
                </div>

                {/* Rendered tags */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Tags</p>
                  <p className={`text-xs rounded-lg px-3 py-2 border font-mono ${
                    previewTags
                      ? 'bg-gray-800 border-gray-700 text-gray-300'
                      : 'bg-gray-800/30 border-gray-800 text-gray-600 italic'
                  }`}>
                    {previewTags || 'Tags template empty'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="lg:col-span-2 flex justify-end gap-3 pt-2 border-t border-gray-800">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────

function DeleteConfirm({ name, deleting, onConfirm, onCancel }: {
  name: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-2">Delete Template</h3>
        <p className="text-sm text-gray-400 mb-6">
          Delete <span className="text-white font-medium">&ldquo;{name}&rdquo;</span>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:border-gray-600 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm} disabled={deleting}
            className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
