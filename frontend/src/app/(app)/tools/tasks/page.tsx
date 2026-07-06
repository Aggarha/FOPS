'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, X, ChevronDown, Loader2, RefreshCw, Trash2, Edit3,
  CheckCircle2, Clock, AlertCircle, Zap, User, Tag, Calendar,
  Music, ArrowRight, Save, Circle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string | null;
  created_by: string | null;
  due_date: string | null;
  release_upc: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface ColumnCounts {
  todo: number;
  in_progress: number;
  review: number;
  done: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const COLUMNS: { id: Task['status']; label: string; accent: string; dot: string }[] = [
  { id: 'todo',        label: 'To Do',       accent: 'border-gray-700',   dot: 'bg-gray-500' },
  { id: 'in_progress', label: 'In Progress',  accent: 'border-blue-800',   dot: 'bg-blue-400' },
  { id: 'review',      label: 'In Review',    accent: 'border-yellow-800', dot: 'bg-yellow-400' },
  { id: 'done',        label: 'Done',         accent: 'border-green-800',  dot: 'bg-green-500' },
];

const PRIORITY_CONFIG: Record<Task['priority'], { label: string; color: string; bg: string; border: string }> = {
  low:    { label: 'Low',    color: 'text-gray-400',   bg: 'bg-gray-800',      border: 'border-gray-700' },
  medium: { label: 'Medium', color: 'text-blue-400',   bg: 'bg-blue-950/40',   border: 'border-blue-900' },
  high:   { label: 'High',   color: 'text-orange-400', bg: 'bg-orange-950/30', border: 'border-orange-900' },
  urgent: { label: 'Urgent', color: 'text-red-400',    bg: 'bg-red-950/30',    border: 'border-red-900' },
};

const EMPTY_FORM = {
  title: '', description: '', status: 'todo' as Task['status'],
  priority: 'medium' as Task['priority'], assignee: '', due_date: '', release_upc: '', tags: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function dueBadge(due: string | null): { label: string; color: string } | null {
  if (!due) return null;
  const diff = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: 'text-red-400' };
  if (diff === 0) return { label: 'Due today', color: 'text-orange-400' };
  if (diff <= 3)  return { label: `${diff}d left`, color: 'text-yellow-400' };
  return { label: `${diff}d`, color: 'text-gray-600' };
}

// ─── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onDelete, onStatusChange }: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Task['status']) => void;
}) {
  const [showMove, setShowMove] = useState(false);
  const prio = PRIORITY_CONFIG[task.priority];
  const due = dueBadge(task.due_date);
  const otherCols = COLUMNS.filter((c) => c.id !== task.status);

  return (
    <div className={`rounded-xl border bg-gray-950 overflow-hidden group transition-all hover:border-gray-600 ${prio.border}`}>
      <div className="px-3 pt-3 pb-2 space-y-2">
        {/* Priority + actions row */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prio.color} ${prio.bg} ${prio.border}`}>
            {prio.label}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setShowMove((v) => !v)}
              title="Move to column"
              className="p-1 rounded text-gray-700 hover:text-blue-400 transition-colors">
              <ArrowRight className="w-3 h-3" />
            </button>
            <button onClick={() => onEdit(task)} className="p-1 rounded text-gray-700 hover:text-gray-300 transition-colors">
              <Edit3 className="w-3 h-3" />
            </button>
            <button onClick={() => onDelete(task.id)} className="p-1 rounded text-gray-700 hover:text-red-400 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Move menu */}
        {showMove && (
          <div className="flex flex-wrap gap-1">
            {otherCols.map((c) => (
              <button key={c.id} onClick={() => { onStatusChange(task.id, c.id); setShowMove(false); }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 transition-all">
                → {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Title */}
        <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-gray-600' : 'text-white'}`}>
          {task.title}
        </p>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{task.description}</p>
        )}

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-900 flex-wrap">
        {task.assignee && (
          <div className="flex items-center gap-1 text-[10px] text-gray-600">
            <User className="w-2.5 h-2.5" />{task.assignee}
          </div>
        )}
        {due && (
          <div className={`flex items-center gap-1 text-[10px] font-semibold ${due.color} ml-auto`}>
            <Calendar className="w-2.5 h-2.5" />{due.label}
          </div>
        )}
        {task.release_upc && (
          <div className="flex items-center gap-1 text-[10px] text-gray-700">
            <Music className="w-2.5 h-2.5" />{task.release_upc.slice(-6)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Task Form Modal ─────────────────────────────────────────────────────────────

function TaskModal({ initial, onSave, onClose, assignees }: {
  initial?: Task | null;
  onSave: (data: typeof EMPTY_FORM) => Promise<void>;
  onClose: () => void;
  assignees: string[];
}) {
  const [form, setForm] = useState(initial ? {
    title: initial.title,
    description: initial.description ?? '',
    status: initial.status,
    priority: initial.priority,
    assignee: initial.assignee ?? '',
    due_date: initial.due_date ?? '',
    release_upc: initial.release_upc ?? '',
    tags: initial.tags.join(', '),
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-900">
          <h2 className="text-sm font-bold text-white">{initial ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-gray-700 hover:text-gray-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)}
            placeholder="Task title…" autoFocus
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />

          {/* Description */}
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder="Description (optional)…" rows={3}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-300 placeholder-gray-700 focus:border-gray-600 focus:outline-none resize-none" />

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none">
                {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none">
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Assignee</label>
              <input type="text" value={form.assignee} onChange={(e) => set('assignee', e.target.value)}
                list="assignee-list" placeholder="Name or email…"
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
              <datalist id="assignee-list">
                {assignees.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:border-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Release UPC + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Release UPC</label>
              <input type="text" value={form.release_upc} onChange={(e) => set('release_upc', e.target.value)}
                placeholder="Optional UPC link…"
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Tags</label>
              <input type="text" value={form.tags} onChange={(e) => set('tags', e.target.value)}
                placeholder="tag1, tag2…"
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-700 focus:border-gray-600 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-900">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {initial ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ───────────────────────────────────────────────────────────────

function KanbanColumn({ col, tasks, counts, onEdit, onDelete, onStatusChange, onAddClick }: {
  col: typeof COLUMNS[0];
  tasks: Task[];
  counts: ColumnCounts;
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Task['status']) => void;
  onAddClick: (status: Task['status']) => void;
}) {
  const count = counts[col.id] ?? 0;
  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border-t border-x ${col.accent} bg-gray-950`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${col.dot}`} />
          <span className="text-xs font-bold text-gray-300">{col.label}</span>
          <span className="text-[10px] font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <button onClick={() => onAddClick(col.id)}
          className="p-1 rounded text-gray-700 hover:text-green-400 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className={`flex-1 border-x border-b ${col.accent} rounded-b-xl bg-gray-900/20 p-2 space-y-2 min-h-[200px]`}>
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-800 text-xs">Empty</div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [counts, setCounts]         = useState<ColumnCounts>({ todo: 0, in_progress: 0, review: 0, done: 0 });
  const [assignees, setAssignees]   = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<Task['status']>('todo');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterAssignee) params.set('assignee', filterAssignee);
      if (filterPriority) params.set('priority', filterPriority);
      const qs = params.toString() ? `?${params}` : '';
      const data = await apiFetch(`/api/tasks${qs}`);
      setTasks(data.tasks ?? []);
      setCounts(data.counts ?? { todo: 0, in_progress: 0, review: 0, done: 0 });
      setAssignees(data.assignees ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterAssignee, filterPriority]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const openCreate = (status: Task['status'] = 'todo') => {
    setEditingTask(null);
    setDefaultStatus(status);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => { setEditingTask(task); setModalOpen(true); };

  const saveTask = async (form: typeof EMPTY_FORM) => {
    const body = {
      title:       form.title,
      description: form.description || null,
      status:      form.status,
      priority:    form.priority,
      assignee:    form.assignee || null,
      due_date:    form.due_date || null,
      release_upc: form.release_upc || null,
      tags:        form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };

    if (editingTask) {
      await apiFetch(`/api/tasks/${editingTask.id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    } else {
      await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    }
    setModalOpen(false);
    fetchTasks();
  };

  const deleteTask = async (id: number) => {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks((p) => p.filter((t) => t.id !== id));
    setCounts((p) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return p;
      return { ...p, [task.status]: Math.max(0, (p[task.status] ?? 1) - 1) };
    });
  };

  const moveTask = async (id: number, status: Task['status']) => {
    await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }), headers: { 'Content-Type': 'application/json' } });
    fetchTasks();
  };

  const tasksByCol = (status: Task['status']) => tasks.filter((t) => t.status === status);
  const totalTasks = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Task Board</h1>
          <p className="text-sm text-gray-500 mt-1">Collaborative operations workflow — {totalTasks} total tasks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters */}
          {assignees.length > 0 && (
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-400 focus:border-gray-600 focus:outline-none">
              <option value="">All assignees</option>
              {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-400 focus:border-gray-600 focus:outline-none">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => { setRefreshing(true); fetchTasks(); }}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => openCreate()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              tasks={tasksByCol(col.id)}
              counts={counts}
              onEdit={openEdit}
              onDelete={deleteTask}
              onStatusChange={moveTask}
              onAddClick={openCreate}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <TaskModal
          initial={editingTask}
          onSave={saveTask}
          onClose={() => setModalOpen(false)}
          assignees={assignees}
        />
      )}
    </div>
  );
}
