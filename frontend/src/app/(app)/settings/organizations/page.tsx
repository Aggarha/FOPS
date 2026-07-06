'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Edit3, Trash2, X, Save, Loader2,
  Users, Globe, Palette, CheckCircle,
} from 'lucide-react';
import {
  createOrganization,
  deleteOrganization,
  fetchMyOrganization,
  fetchOrganizations,
  updateOrganization,
  type Organization,
} from '@/lib/api';

const PLAN_CONFIG: Record<string, { label: string; color: string }> = {
  starter:    { label: 'Starter',    color: 'text-gray-400' },
  pro:        { label: 'Pro',        color: 'text-blue-400' },
  enterprise: { label: 'Enterprise', color: 'text-purple-400' },
};

const EMPTY_FORM = { slug: '', name: '', logo_url: '', primary_color: '#22c55e', plan: 'starter' };

function OrgModal({ initial, onSave, onClose }: {
  initial?: Organization | null;
  onSave: (data: typeof EMPTY_FORM) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial ? {
    slug: initial.slug, name: initial.name,
    logo_url: initial.logo_url ?? '', primary_color: initial.primary_color, plan: initial.plan,
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.slug.trim() || !form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-900">
          <h2 className="text-sm font-bold text-white">{initial ? 'Edit Organization' : 'New Organization'}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="Organization name…" autoFocus
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
          <input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="url-slug (e.g. acme-corp)"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none font-mono"
            disabled={!!initial} />
          <input value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)}
            placeholder="Logo URL (optional)"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Brand Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-xs text-gray-500 font-mono">{form.primary_color}</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Plan</label>
              <select value={form.plan} onChange={(e) => set('plan', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none">
                {Object.entries(PLAN_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-900">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name.trim() || !form.slug.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {initial ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const load = useCallback(async () => {
    try {
      const [all, mine] = await Promise.all([
        fetchOrganizations().catch(() => ({ orgs: [] })),
        fetchMyOrganization().catch(() => ({ org: null })),
      ]);
      setOrgs(all.orgs ?? []);
      setMyOrg(mine.org ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveOrg = async (form: typeof EMPTY_FORM) => {
    if (editing) {
      await updateOrganization(editing.id, {
        name: form.name,
        logo_url: form.logo_url || null,
        primary_color: form.primary_color,
        plan: form.plan,
      });
    } else {
      await createOrganization({
        slug: form.slug,
        name: form.name,
        logo_url: form.logo_url || null,
        primary_color: form.primary_color,
        plan: form.plan,
      });
    }
    setModal(false);
    setEditing(null);
    load();
  };

  const deleteOrg = async (id: number) => {
    await deleteOrganization(id);
    setOrgs((p) => p.filter((o) => o.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Organizations</h1>
          <p className="text-sm text-gray-500 mt-1">Multi-tenant workspace management — {orgs.length} organizations</p>
        </div>
        <button onClick={() => { setEditing(null); setModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition">
          <Plus className="w-4 h-4" /> New Organization
        </button>
      </div>

      {/* My Org */}
      {myOrg && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Your Organization</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: myOrg.primary_color + '20', border: `2px solid ${myOrg.primary_color}` }}>
              <Building2 className="w-5 h-5" style={{ color: myOrg.primary_color }} />
            </div>
            <div>
              <p className="font-bold text-white">{myOrg.name}</p>
              <p className="text-xs text-gray-500">/{myOrg.slug} · {PLAN_CONFIG[myOrg.plan]?.label ?? myOrg.plan}</p>
            </div>
            <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
          </div>
        </div>
      )}

      {/* All Orgs */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-gray-700 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map((org) => {
            const plan = PLAN_CONFIG[org.plan] ?? PLAN_CONFIG.starter;
            return (
              <div key={org.id} className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-4 group">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: org.primary_color + '20', border: `2px solid ${org.primary_color}` }}>
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={org.name} className="w-6 h-6 object-contain rounded" />
                    ) : (
                      <Building2 className="w-5 h-5" style={{ color: org.primary_color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{org.name}</p>
                    <p className="text-[10px] text-gray-600 font-mono">/{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditing(org); setModal(true); }}
                      className="p-1.5 rounded text-gray-700 hover:text-gray-300 transition">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteOrg(org.id)}
                      className="p-1.5 rounded text-gray-700 hover:text-red-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold ${plan.color} bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full`}>
                    {plan.label}
                  </span>
                  <span className={`text-[10px] font-bold ${org.active ? 'text-green-400 bg-green-950/30 border-green-900' : 'text-red-400 bg-red-950/30 border-red-900'} border px-2 py-0.5 rounded-full`}>
                    {org.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-[9px] text-gray-700 ml-auto">
                    {new Date(org.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}

          {orgs.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center py-16 text-gray-700">
              <Building2 className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No organizations yet</p>
              <p className="text-xs mt-1">Create one to enable multi-tenant isolation</p>
            </div>
          )}
        </div>
      )}

      {modal && (
        <OrgModal initial={editing} onSave={saveOrg} onClose={() => { setModal(false); setEditing(null); }} />
      )}
    </div>
  );
}
