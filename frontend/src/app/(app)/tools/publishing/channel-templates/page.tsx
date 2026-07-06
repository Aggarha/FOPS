'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import {
  Plus, Edit, Trash2, Eye, EyeOff, ChevronRight, Globe,
  X, Loader2, Check, PlusCircle, MinusCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface PublishingChannelTemplate {
  id: number;
  uid: string;
  channel_name: string;
  intro_text: string;
  subscribe_text: string;
  social_links: Record<string, string>;
  footer_text: string;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SocialLinkRow {
  platform: string;
  url: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function linksToRows(links: Record<string, string>): SocialLinkRow[] {
  return Object.entries(links).map(([platform, url]) => ({ platform, url }));
}

function rowsToLinks(rows: SocialLinkRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.platform.trim()) out[r.platform.trim()] = r.url.trim();
  }
  return out;
}

const EMPTY_FORM = {
  channel_name:   '',
  intro_text:     '',
  subscribe_text: '',
  footer_text:    '',
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function ChannelTemplatesPage() {
  const [channels, setChannels]         = useState<PublishingChannelTemplate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editTarget, setEditTarget]     = useState<PublishingChannelTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublishingChannelTemplate | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [socialRows, setSocialRows]     = useState<SocialLinkRow[]>([]);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/publishing/channels');
      if (res.success) setChannels(res.channels);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setSocialRows([]);
    setError('');
    setShowModal(true);
  }

  function openEdit(c: PublishingChannelTemplate) {
    setEditTarget(c);
    setForm({
      channel_name:   c.channel_name,
      intro_text:     c.intro_text,
      subscribe_text: c.subscribe_text,
      footer_text:    c.footer_text,
    });
    setSocialRows(linksToRows(c.social_links));
    setError('');
    setShowModal(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.channel_name.trim()) { setError('Channel name is required'); return; }
    setSaving(true);
    setError('');
    const body = {
      ...form,
      social_links: rowsToLinks(socialRows),
    };
    try {
      if (editTarget) {
        await apiFetch(`/api/publishing/channels/${editTarget.id}`, {
          method: 'PATCH', body: JSON.stringify(body),
        });
        flash('Channel template updated');
      } else {
        await apiFetch('/api/publishing/channels', {
          method: 'POST', body: JSON.stringify(body),
        });
        flash('Channel template created');
      }
      setShowModal(false);
      fetchChannels();
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
      await apiFetch(`/api/publishing/channels/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      flash('Channel template deleted');
      fetchChannels();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────

  async function toggleActive(c: PublishingChannelTemplate) {
    try {
      await apiFetch(`/api/publishing/channels/${c.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !c.active }),
      });
      fetchChannels();
    } catch {
      /* ignore */
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2">
        <Link href="/tools/publishing" className="hover:text-gray-300 transition-colors">Publishing Suite</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-300">Channel Templates</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Channel Templates</h1>
            <p className="text-sm text-gray-400">Per-channel intro text, social links, and footer blocks</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Channel
        </button>
      </div>

      {/* Success flash */}
      {successMsg && (
        <div className="mb-4 px-4 py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {successMsg}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium text-gray-400">No channel templates yet</p>
          <p className="text-sm">Create a channel template to add intro text, social links, and footer blocks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {channels.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              onEdit={() => openEdit(c)}
              onDelete={() => setDeleteTarget(c)}
              onToggle={() => toggleActive(c)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <ChannelModal
          editTarget={editTarget}
          form={form}
          setForm={setForm}
          socialRows={socialRows}
          setSocialRows={setSocialRows}
          saving={saving}
          error={error}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.channel_name}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Channel Card ──────────────────────────────────────────────────────────

function ChannelCard({
  channel, onEdit, onDelete, onToggle,
}: {
  channel: PublishingChannelTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const socialCount = Object.keys(channel.social_links || {}).length;

  return (
    <div className={`bg-gray-900 border rounded-xl p-5 transition-all ${
      channel.active
        ? 'border-gray-700/60 hover:border-gray-600'
        : 'border-gray-800 opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h3 className="font-medium text-white text-sm">{channel.channel_name}</h3>
            {socialCount > 0 && (
              <p className="text-xs text-gray-500">{socialCount} social link{socialCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
      </div>

      {/* Intro preview */}
      {channel.intro_text && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2 bg-gray-800/50 px-2 py-1.5 rounded leading-relaxed">
          {channel.intro_text}
        </p>
      )}

      {/* Social links preview */}
      {socialCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.keys(channel.social_links).slice(0, 4).map((platform) => (
            <span key={platform} className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-400 rounded-full">
              {platform}
            </span>
          ))}
          {socialCount > 4 && (
            <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-500 rounded-full">
              +{socialCount - 4} more
            </span>
          )}
        </div>
      )}

      {/* Footer preview */}
      {channel.footer_text && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-1 italic">
          Footer: {channel.footer_text.substring(0, 60)}{channel.footer_text.length > 60 ? '…' : ''}
        </p>
      )}

      {/* Status + actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            channel.active
              ? 'text-green-400 hover:text-green-300'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          {channel.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {channel.active ? 'Active' : 'Inactive'}
        </button>
        <div className="flex items-center gap-1">
          <IconBtn icon={<Edit className="w-3.5 h-3.5" />} title="Edit" onClick={onEdit} />
          <IconBtn icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" onClick={onDelete} danger />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon, title, onClick, danger }: {
  icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick} title={title}
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

// ── Channel Modal ─────────────────────────────────────────────────────────

function ChannelModal({
  editTarget, form, setForm, socialRows, setSocialRows,
  saving, error, onSave, onClose,
}: {
  editTarget: PublishingChannelTemplate | null;
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  socialRows: SocialLinkRow[];
  setSocialRows: React.Dispatch<React.SetStateAction<SocialLinkRow[]>>;
  saving: boolean;
  error: string;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  function field(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  function addRow() {
    setSocialRows((r) => [...r, { platform: '', url: '' }]);
  }

  function removeRow(i: number) {
    setSocialRows((r) => r.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, key: keyof SocialLinkRow, val: string) {
    setSocialRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl my-8 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            {editTarget ? 'Edit Channel Template' : 'New Channel Template'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-6 space-y-5">

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Channel name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Channel Name *</label>
            <input
              value={form.channel_name} onChange={field('channel_name')} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
              placeholder="e.g. My Music Channel"
            />
          </div>

          {/* Intro text */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Intro Text</label>
            <p className="text-xs text-gray-600 mb-2">Appears at the top of every description. Supports <code className="text-violet-400">{'{{variables}}'}</code>.</p>
            <textarea
              value={form.intro_text} onChange={field('intro_text')} rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
              placeholder="Listen &amp; Download on all platforms:"
            />
          </div>

          {/* Subscribe text */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Subscribe / CTA Text</label>
            <textarea
              value={form.subscribe_text} onChange={field('subscribe_text')} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
              placeholder="Subscribe for more: https://youtube.com/@yourchannel"
            />
          </div>

          {/* Social links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 font-medium">Social Links</label>
              <button
                type="button" onClick={addRow}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Add Link
              </button>
            </div>
            {socialRows.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No social links added.</p>
            ) : (
              <div className="space-y-2">
                {socialRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row.platform}
                      onChange={(e) => updateRow(i, 'platform', e.target.value)}
                      className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors shrink-0"
                      placeholder="Platform"
                    />
                    <input
                      value={row.url}
                      onChange={(e) => updateRow(i, 'url', e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
                      placeholder="https://..."
                    />
                    <button
                      type="button" onClick={() => removeRow(i)}
                      className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer text */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Footer Text</label>
            <p className="text-xs text-gray-600 mb-2">Appears at the very bottom of the description.</p>
            <textarea
              value={form.footer_text} onChange={field('footer_text')} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
              placeholder="#hashtags or copyright notice"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────

function DeleteConfirm({ name, deleting, onConfirm, onCancel }: {
  name: string; deleting: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-2">Delete Channel Template</h3>
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
