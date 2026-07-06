'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Save, Loader2, RefreshCw, Check, X, Wrench,
  Crown, Eye, Lock, ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Permission {
  id: number;
  role: string;
  can_approve: boolean;
  can_reject: boolean;
  can_run_tools: boolean;
  can_manage_users: boolean;
  can_view_audit: boolean;
  can_access_settings: boolean;
  can_sync_sheets: boolean;
  can_view_sources: boolean;
  can_manage_sources: boolean;
  can_manage_mappings: boolean;
  can_view_release_picker: boolean;
  can_view_templates: boolean;
  can_manage_templates: boolean;
  can_view_channel_templates: boolean;
  can_manage_channel_templates: boolean;
  allowed_tools: string[];
  description: string | null;
}

const ROLE_META: Record<string, { label: string; icon: any; color: string }> = {
  admin:    { label: 'Admin',    icon: Crown,   color: 'text-red-400' },
  analyst:  { label: 'Analyst',  icon: Shield,  color: 'text-purple-400' },
  operator: { label: 'Operator', icon: Wrench,  color: 'text-blue-400' },
  viewer:   { label: 'Viewer',   icon: Eye,     color: 'text-gray-400' },
};

const BOOLEAN_PERMS: { key: keyof Permission; label: string; desc: string }[] = [
  { key: 'can_approve',         label: 'Approve',          desc: 'Approve releases & submissions' },
  { key: 'can_reject',          label: 'Reject',           desc: 'Reject releases & submissions' },
  { key: 'can_run_tools',       label: 'Run Tools',        desc: 'Execute processing tools' },
  { key: 'can_manage_users',    label: 'Manage Users',     desc: 'Create/edit/delete users' },
  { key: 'can_view_audit',      label: 'View Audit Logs',  desc: 'Access audit trail' },
  { key: 'can_access_settings', label: 'Settings',         desc: 'Change system settings' },
  { key: 'can_sync_sheets',     label: 'Sync Sheets',      desc: 'Trigger Google Sheets sync' },
  { key: 'can_view_sources',         label: 'View Sources',         desc: 'View publishing source library' },
  { key: 'can_manage_sources',        label: 'Manage Sources',        desc: 'Create/edit/delete sources & import files' },
  { key: 'can_manage_mappings',       label: 'Manage Mappings',       desc: 'Create/edit/delete column mappings' },
  { key: 'can_view_release_picker',          label: 'Release Picker',           desc: 'Search and autofill from imported metadata records' },
  { key: 'can_view_templates',               label: 'View Templates',            desc: 'View publishing template library' },
  { key: 'can_manage_templates',             label: 'Manage Templates',          desc: 'Create/edit/delete publishing templates' },
  { key: 'can_view_channel_templates',       label: 'View Channel Templates',    desc: 'View channel template configurations' },
  { key: 'can_manage_channel_templates',     label: 'Manage Channel Templates',  desc: 'Create/edit/delete channel templates' },
];

const ALL_TOOLS = [
  'publishing', 'credits', 'audio-match', 'youtube-search',
  'fingerprint-db', 'channel-scrape', 'monitoring', 'timeline',
  'tasks', 'operations', 'notifications', 'audit', 'users',
  'protection', 'publishing-hub', 'metadata', 'tags',
  'match-review', 'claims',
];

function ToggleCell({ value, onChange, disabled }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
      className={`w-8 h-5 rounded-full transition-all flex items-center ${value ? 'bg-green-600' : 'bg-gray-700'} ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${value ? 'translate-x-3' : 'translate-x-0'}`} />
    </button>
  );
}

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, Partial<Permission>>>({});
  const [expandedTools, setExpandedTools] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/api/permissions');
      setPermissions(data.permissions ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLocal = (role: string, key: keyof Permission, value: any) => {
    setDirty((d) => ({
      ...d,
      [role]: { ...(d[role] ?? {}), [key]: value },
    }));
    setPermissions((p) =>
      p.map((perm) => perm.role === role ? { ...perm, [key]: value } : perm)
    );
  };

  const saveRole = async (role: string) => {
    const changes = dirty[role];
    if (!changes) return;
    setSaving(role);
    try {
      await apiFetch(`/api/permissions/${role}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      setDirty((d) => { const n = { ...d }; delete n[role]; return n; });
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  const getPerm = (role: string): Permission | undefined =>
    permissions.find((p) => p.role === role);

  const allRoles = Object.keys(ROLE_META);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Permissions</h1>
          <p className="text-sm text-gray-500 mt-1">Granular role-based access control matrix</p>
        </div>
        <button onClick={() => { setLoading(true); load(); }}
          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-gray-700 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {allRoles.map((role) => {
            const perm = getPerm(role);
            const meta = ROLE_META[role] ?? { label: role, icon: Shield, color: 'text-gray-400' };
            const Icon = meta.icon;
            const isAdmin = role === 'admin';
            const hasDirty = !!dirty[role];

            return (
              <div key={role} className={`rounded-xl border ${hasDirty ? 'border-yellow-800' : 'border-gray-800'} bg-gray-950 overflow-hidden transition-all`}>
                {/* Role header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-900">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{meta.label}</p>
                      {perm?.description && <p className="text-[10px] text-gray-600">{perm.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasDirty && (
                      <button onClick={() => saveRole(role)} disabled={saving === role}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition disabled:opacity-40">
                        {saving === role ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </button>
                    )}
                    {isAdmin && (
                      <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-900 px-2 py-0.5 rounded-full">Full Access</span>
                    )}
                  </div>
                </div>

                {/* Permission toggles */}
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {BOOLEAN_PERMS.map(({ key, label, desc }) => {
                      const val = perm ? !!(perm as any)[key] : false;
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800">
                          <div>
                            <p className="text-xs font-bold text-white">{label}</p>
                            <p className="text-[9px] text-gray-600 mt-0.5">{desc}</p>
                          </div>
                          <ToggleCell
                            value={isAdmin ? true : val}
                            onChange={(v) => !isAdmin && updateLocal(role, key, v)}
                            disabled={isAdmin}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Tool access */}
                  {!isAdmin && (
                    <div className="mt-4">
                      <button onClick={() => setExpandedTools(expandedTools === role ? null : role)}
                        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-300 transition mb-2">
                        <Wrench className="w-3.5 h-3.5" />
                        Tool Access ({perm?.allowed_tools?.length ?? 0} / {ALL_TOOLS.length})
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTools === role ? 'rotate-180' : ''}`} />
                      </button>

                      {expandedTools === role && (
                        <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-gray-900 border border-gray-800">
                          {ALL_TOOLS.map((tool) => {
                            const allowed = perm?.allowed_tools?.includes(tool) ?? false;
                            return (
                              <button key={tool} onClick={() => {
                                const current = perm?.allowed_tools ?? [];
                                const next = allowed
                                  ? current.filter((t) => t !== tool)
                                  : [...current, tool];
                                updateLocal(role, 'allowed_tools', next);
                              }}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition ${
                                  allowed
                                    ? 'bg-green-900/30 text-green-400 border-green-800'
                                    : 'bg-gray-800 text-gray-600 border-gray-700 hover:border-gray-600'
                                }`}>
                                {allowed ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                {tool}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
