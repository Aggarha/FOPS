'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Settings,
  Monitor,
  ChevronDown,
  MessageSquare,
  ScrollText,
  Tv,
  LayoutDashboard,
  Terminal,
  Radio,
} from 'lucide-react';
import { CATEGORIES, getToolsForRole, type UserRole } from '@/lib/tools-config';
import { useAuth } from '@/context/AuthContext';

const CORE_NAV = [
  { href: '/', label: 'Dashboard', icon: Home, exact: true },
  { href: '/dashboard', label: 'Operations', icon: LayoutDashboard, exact: false },
];

const SYSTEM_NAV = [
  { href: '/communications', label: 'Communications', icon: MessageSquare },
  { href: '/logs', label: 'Activity Logs', icon: ScrollText },
  { href: '/operations/live-logs', label: 'Live Logs', icon: Terminal },
  { href: '/control', label: 'Control Panel', icon: Radio },
  { href: '/kiosk', label: 'Kiosk', icon: Monitor },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const CATEGORY_ICON: Record<string, string> = {
  publishing: '🎵',
  protection: '🛡',
  monitoring: '📺',
  operations: '⚙',
};

export function EnhancedSidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['publishing', 'protection']);

  if (loading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-950 border-r border-gray-800/60 pt-5">
        <div className="px-5 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-800 animate-pulse" />
            <div className="h-5 w-20 bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="px-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 bg-gray-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </aside>
    );
  }

  const userRole = (user?.role as UserRole) || 'viewer';
  const allowedTools = getToolsForRole(userRole);
  const allowedToolIds = new Set(allowedTools.map((t) => t.id));

  const toggleCategory = (id: string) =>
    setExpandedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const isActive = (href: string, exact = false): boolean => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 flex flex-col bg-gray-950 border-r border-gray-800/60 overflow-hidden">
      {/* Logo */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-gray-800/60">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center font-black text-black text-sm shadow-lg shadow-green-500/20 group-hover:shadow-green-500/40 transition-all">
            F
          </div>
          <div>
            <p className="text-base font-bold text-white leading-none group-hover:text-green-400 transition-colors">FOPS</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Enterprise Ops</p>
          </div>
        </Link>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-4 space-y-5">
        {/* Core nav */}
        <nav className="px-3 space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Navigation</p>
          {CORE_NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive(href, exact)
                  ? 'bg-green-600/15 text-green-400 border border-green-600/30 shadow-sm shadow-green-900/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
          <Link
            href="/tv"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              pathname === '/tv'
                ? 'bg-violet-600/15 text-violet-400 border border-violet-600/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
          >
            <Tv className="w-4 h-4 flex-shrink-0" />
            TV Mode
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-400 border border-violet-800/50 font-semibold">LIVE</span>
          </Link>
        </nav>

        {/* Tool categories */}
        <div className="px-3 space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Tools</p>
          {Object.entries(CATEGORIES).map(([categoryId, category]) => {
            const visibleTools = category.tools.filter((t) => allowedToolIds.has(t.id));
            if (visibleTools.length === 0) return null;
            const isExpanded = expandedCategories.includes(categoryId);

            return (
              <div key={categoryId}>
                <button
                  onClick={() => toggleCategory(categoryId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/40 transition-all duration-150"
                >
                  <span className="text-base leading-none">{CATEGORY_ICON[categoryId] || '⚙'}</span>
                  <span className="flex-1 text-left">{category.name}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {isExpanded && (
                  <div className="ml-3 mt-0.5 mb-1 pl-3 border-l border-gray-800/60 space-y-0.5">
                    {visibleTools.map((tool) => (
                      <Link
                        key={tool.id}
                        href={tool.href}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 ${
                          isActive(tool.href)
                            ? 'bg-gray-700/60 text-white border border-gray-600/40'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tool.status === 'active' ? 'bg-green-500' : 'bg-gray-700'}`} />
                        <span className="font-medium truncate">{tool.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* System nav */}
        <nav className="px-3 space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">System</p>
          {SYSTEM_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive(href)
                  ? 'bg-gray-800/80 text-gray-200 border border-gray-700/50'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* User footer */}
      <div className="flex-shrink-0 border-t border-gray-800/60 p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-300 truncate">{user.email}</p>
              <p className="text-[10px] text-gray-600 capitalize">{user.role}</p>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border flex-shrink-0 ${
              user.role === 'admin' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
              user.role === 'analyst' ? 'bg-purple-900/30 text-purple-400 border-purple-800/50' :
              user.role === 'operator' ? 'bg-blue-900/30 text-blue-400 border-blue-800/50' :
              'bg-gray-900/30 text-gray-400 border-gray-800/50'
            }`}>
              {user.role?.toUpperCase()}
            </span>
          </div>
        ) : (
          <div className="h-8 bg-gray-800/50 rounded-lg animate-pulse" />
        )}
      </div>
    </aside>
  );
}
