'use client';

import { CATEGORIES, getToolsForRole } from '@/lib/tools-config';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useRouter } from 'next/navigation';

interface CategoryPageProps {
  categoryId: 'publishing' | 'protection' | 'monitoring' | 'operations';
}

export function CategoryDashboard({ categoryId }: CategoryPageProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  const category = CATEGORIES[categoryId];
  const userRole = (user.role as any) || 'viewer';
  const allTools = getToolsForRole(userRole);
  const allowedToolIds = new Set(allTools.map((t) => t.id));
  const tools = category.tools.filter((t) => allowedToolIds.has(t.id));

  const statusColors = {
    active: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    running: 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30',
    error: 'from-red-500/20 to-pink-500/10 border-red-500/30',
    idle: 'from-gray-500/20 to-slate-500/10 border-gray-500/30',
  };

  const statusIcons = {
    active: '🟢',
    running: '🟡',
    error: '🔴',
    idle: '⚫',
  };

  return (
    <div className="max-w-7xl space-y-8">
      {/* Category Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-5xl">{category.name.split(' ')[0]}</div>
          <div>
            <h1 className="text-4xl font-bold text-white">{category.name.split(' ').slice(1).join(' ')}</h1>
            <p className="text-gray-400 mt-2">{category.description}</p>
          </div>
        </div>

        {/* Category Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className="text-sm text-gray-400">Available Tools</p>
            <p className="text-2xl font-bold text-white mt-1">{tools.length}</p>
          </div>
          <div className="px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className="text-sm text-gray-400">Active</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{tools.filter((t) => t.status === 'active').length}</p>
          </div>
          <div className="px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className="text-sm text-gray-400">Running</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{tools.filter((t) => t.status === 'running').length}</p>
          </div>
          <div className="px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className="text-sm text-gray-400">Role Access</p>
            <p className="text-2xl font-bold text-blue-400 mt-1 capitalize">{userRole}</p>
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Tools</h2>
        {tools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <Card
                key={tool.id}
                interactive
                onClick={() => router.push(tool.href)}
                className={`group cursor-pointer border-2 bg-gradient-to-br ${statusColors[tool.status || 'idle']}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-3 rounded-lg bg-gradient-to-br ${tool.color} text-white shadow-lg group-hover:scale-110 transition-transform`}
                    >
                      <tool.icon className="w-6 h-6" />
                    </div>
                    <div className="text-xl">{statusIcons[tool.status || 'idle']}</div>
                  </div>
                  <CardTitle className="mt-4 group-hover:text-green-400 transition-colors">{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{tool.description}</CardDescription>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase">
                      {tool.status?.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </span>
                    <span className="text-green-400 group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
            <p className="text-gray-400">No tools available for your role ({userRole})</p>
          </div>
        )}
      </div>

      {/* Quick Start */}
      {tools.length > 0 && (
        <div className="rounded-lg border border-green-700/50 bg-gradient-to-r from-green-900/20 to-emerald-900/20 p-6">
          <h3 className="text-lg font-semibold text-green-400 mb-3">Quick Start</h3>
          <p className="text-gray-300 mb-4">
            Choose a tool above to get started. Most tools support batch operations and export functionality.
          </p>
          <div className="flex gap-2 flex-wrap">
            {tools.slice(0, 3).map((tool) => (
              <button
                key={tool.id}
                onClick={() => router.push(tool.href)}
                className="px-4 py-2 rounded-lg bg-green-600/20 text-green-400 border border-green-600/50 hover:bg-green-600/30 transition-all text-sm font-medium"
              >
                {tool.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
