'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, RefreshCw, Search, Shield, Edit2,
  Trash2, CheckCircle, XCircle, Crown, Eye, Wrench, UserCheck,
} from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser } from '@/lib/api';
import type { ManagedUser } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  admin:    { label: 'Admin',    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: Crown },
  analyst:  { label: 'Analyst',  color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: Shield },
  operator: { label: 'Operator', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   icon: Wrench },
  viewer:   { label: 'Viewer',   color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   icon: Eye },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.viewer;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function initials(u: ManagedUser) {
  return (u.full_name || u.email).slice(0, 2).toUpperCase();
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}
function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');
    try {
      await createUser({ email, password, full_name: fullName || undefined, role });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Create User</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handle} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              placeholder="Optional display name"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Password *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              placeholder="Min. 8 characters"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Role *</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="viewer">Viewer — read-only monitoring</option>
              <option value="operator">Operator — run protection tools</option>
              <option value="analyst">Analyst — full tool access</option>
              <option value="admin">Admin — full system access</option>
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 hover:text-white transition-all text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: number; role: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ManagedUser | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async (u: ManagedUser) => {
    setActionLoading(u.id);
    try {
      await updateUser(u.id, { active: !u.active });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: !u.active } : x));
    } catch {} finally { setActionLoading(null); }
  };

  const handleRoleChange = async (id: number, role: string) => {
    setActionLoading(id);
    try {
      await updateUser(id, { role });
      setUsers(prev => prev.map(x => x.id === id ? { ...x, role } : x));
      setEditingRole(null);
    } catch {} finally { setActionLoading(null); }
  };

  const handleDelete = async (u: ManagedUser) => {
    setActionLoading(u.id);
    try {
      await deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setConfirmDelete(null);
    } catch {} finally { setActionLoading(null); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      u.email.toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = Object.keys(ROLE_CONFIG).reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-8 h-8 text-emerald-400" />
            <h1 className="text-3xl font-bold text-white">User Management</h1>
          </div>
          <p className="text-gray-400">{users.length} users — manage roles and access</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all text-sm"
            >
              <UserPlus className="w-4 h-4" />
              New User
            </button>
          )}
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setRoleFilter(roleFilter === key ? '' : key)}
              className={`px-4 py-3 rounded-xl border text-left transition-all ${
                roleFilter === key
                  ? `${cfg.bg} ${cfg.border}`
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-white">{roleCounts[key] || 0}</div>
            </button>
          );
        })}
      </div>

      {/* Search/filter */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="bg-transparent text-white text-sm outline-none w-full placeholder-gray-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {!isAdmin && (
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
          View-only mode. Admin role required to manage users.
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 bg-gray-800/80 border-b border-gray-700/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">User</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-700/30">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-16 px-4 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 bg-gray-700 rounded" />
                  <div className="h-2.5 w-28 bg-gray-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-gray-700 mb-3" />
            <p className="text-gray-400">No users found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/20">
            {filtered.map(u => {
              const isSelf = currentUser?.id === u.id || (currentUser as any)?.user_id === u.id;
              const busy = actionLoading === u.id;
              const isEditing = editingRole?.id === u.id;
              return (
                <div key={u.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-gray-800/30 transition-all">
                  {/* Avatar */}
                  <div className="col-span-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      u.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700/50 text-gray-500'
                    }`}>
                      {initials(u)}
                    </div>
                  </div>
                  {/* Info */}
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{u.full_name || u.email}</span>
                      {isSelf && <span className="text-xs text-gray-500">(you)</span>}
                    </div>
                    {u.full_name && <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>}
                  </div>
                  {/* Role */}
                  <div className="col-span-3">
                    {isAdmin && isEditing ? (
                      <select
                        defaultValue={u.role}
                        autoFocus
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        onBlur={() => setEditingRole(null)}
                        className="text-sm bg-gray-700 border border-gray-500 text-white rounded-lg px-2 py-1"
                      >
                        <option value="viewer">viewer</option>
                        <option value="operator">operator</option>
                        <option value="analyst">analyst</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <RoleBadge role={u.role} />
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => setEditingRole({ id: u.id, role: u.role })}
                            className="p-0.5 text-gray-600 hover:text-gray-300 transition-colors"
                            title="Change role"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`flex items-center gap-1.5 text-xs ${u.active ? 'text-green-400' : 'text-gray-500'}`}>
                      {u.active
                        ? <><CheckCircle className="w-3.5 h-3.5" />Active</>
                        : <><XCircle className="w-3.5 h-3.5" />Inactive</>
                      }
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    {isAdmin && !isSelf && (
                      <>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={busy}
                          className={`p-1.5 rounded-lg transition-all text-sm ${
                            u.active
                              ? 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10'
                              : 'text-gray-500 hover:text-green-400 hover:bg-green-500/10'
                          }`}
                          title={u.active ? 'Deactivate' : 'Activate'}
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(u)}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Delete User</h3>
                <p className="text-gray-400 text-sm">This cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm">
              Delete <span className="font-medium text-white">{confirmDelete.email}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 hover:text-white transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionLoading === confirmDelete.id}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-all text-sm disabled:opacity-50"
              >
                {actionLoading === confirmDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
