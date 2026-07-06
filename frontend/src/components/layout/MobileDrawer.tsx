'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Wrench, Monitor, Activity, Settings, MessageSquare,
  X, ChevronRight, LogOut, Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES, getToolsForRole, type UserRole } from '@/lib/tools-config';

const NAV_ITEMS = [
  { href: '/',                     label: 'Dashboard',  icon: Home,         color: 'text-green-400' },
  { href: '/tools',                label: 'Tools',      icon: Wrench,       color: 'text-blue-400'  },
  { href: '/tv',                   label: 'TV Mode',    icon: Monitor,      color: 'text-violet-400'},
  { href: '/operations/live-logs', label: 'Live Logs',  icon: Activity,     color: 'text-yellow-400'},
  { href: '/communications',       label: 'Comms',      icon: MessageSquare, color: 'text-cyan-400'  },
  { href: '/settings',             label: 'Settings',   icon: Settings,     color: 'text-gray-400'  },
];

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const userRole = (user?.role as UserRole) || 'viewer';
  const allowedTools = getToolsForRole(userRole);
  const allowedToolIds = new Set(allowedTools.map((t) => t.id));

  // Close on route change
  useEffect(() => { onClose(); }, [pathname]);

  // Close on back swipe / escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-50 w-[280px] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'linear-gradient(160deg, rgba(0,20,0,0.98) 0%, rgba(0,0,0,0.99) 100%)',
          borderRight: '1px solid rgba(57,255,20,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b border-gray-800/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center font-bold text-black text-sm">
              F
            </div>
            <div>
              <p className="text-sm font-bold text-white">FOPS</p>
              <p className="text-[10px] text-gray-500">Enterprise Ops</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User badge */}
        {user && (
          <div className="mx-4 mt-3 mb-2 px-3 py-2.5 rounded-xl bg-gray-900/60 border border-gray-800/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black">
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.email}</p>
              <p className="text-[10px] text-green-400 uppercase font-medium">{user.role}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scroll-smooth-ios px-3 py-2 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, color }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-green-600/15 border border-green-600/30 shadow-[0_0_12px_rgba(57,255,20,0.1)]'
                    : 'hover:bg-gray-800/40 active:bg-gray-800/60'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${active ? 'text-green-400' : color}`}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span className={`text-sm font-medium ${active ? 'text-green-400' : 'text-gray-300'}`}>
                  {label}
                </span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-green-400/60" />}
              </Link>
            );
          })}

          {/* Tool categories */}
          <div className="pt-3 pb-1">
            <p className="px-4 text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">
              Categories
            </p>
            {Object.entries(CATEGORIES).map(([categoryId, category]) => {
              const visibleTools = category.tools.filter((t) => allowedToolIds.has(t.id));
              if (visibleTools.length === 0) return null;
              return (
                <div key={categoryId} className="mb-1">
                  <p className="px-4 py-1.5 text-xs text-gray-500 font-semibold">{category.name}</p>
                  {visibleTools.map((tool) => (
                    <Link
                      key={tool.id}
                      href={tool.href}
                      className={`flex items-center gap-3 pl-7 pr-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${
                        pathname === tool.href
                          ? 'text-white bg-gray-800/60'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30 active:bg-gray-800/50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600/60 flex-shrink-0" />
                      {tool.name}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 pb-3 pt-2 border-t border-gray-800/60 space-y-1">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-gray-300 hover:bg-gray-800/40 transition-all text-sm"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button
            onClick={() => { logout(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-900/20 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
