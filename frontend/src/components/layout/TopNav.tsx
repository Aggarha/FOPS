'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NotificationsBell from '@/components/NotificationsBell';
import { LogOut, User, ChevronRight, ArrowLeft, Home } from 'lucide-react';
import Link from 'next/link';

// ── Breadcrumb config ───────────────────────────────────────────────────
interface Crumb { label: string; href: string }

const ROUTE_LABELS: Record<string, string> = {
  '':              'Dashboard',
  'dashboard':     'Operations',
  'tools':         'Tools',
  'communications':'Communications',
  'logs':          'Activity Logs',
  'operations':    'Operations',
  'live-logs':     'Live Logs',
  'settings':      'Settings',
  'control':       'Control Panel',
  'kiosk':         'Kiosk',
  'tv':            'TV Mode',
  'audio-match':   'Audio Match',
  'channel-scrape':'Channel Scraper',
  'fingerprint-db':'Fingerprint DB',
  'monitoring':    'Monitoring',
  'publishing':    'Publishing Suite',
  'publishing-hub':'Publishing Hub',
  'protection':    'Protection',
  'youtube-search':'YT Search',
  'operations-center': 'Operations',
  'audit':         'Audit',
  'notifications': 'Notifications',
  'timeline':      'Timeline',
  'users':         'Users',
  'metadata':      'Metadata',
  'tags':          'Tags',
  'match-review':  'Match Review',
  'claims':        'Claims',
};

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'Dashboard', href: '/' }];

  const crumbs: Crumb[] = [{ label: 'Dashboard', href: '/' }];
  let accumulated = '';
  for (const seg of segments) {
    accumulated += '/' + seg;
    crumbs.push({ label: ROUTE_LABELS[seg] ?? seg, href: accumulated });
  }
  return crumbs;
}

const ROLE_COLORS: Record<string, string> = {
  admin:    'bg-red-600/20 text-red-300 border-red-600/50',
  analyst:  'bg-purple-600/20 text-purple-300 border-purple-600/50',
  operator: 'bg-blue-600/20 text-blue-300 border-blue-600/50',
  viewer:   'bg-gray-600/20 text-gray-300 border-gray-600/50',
};

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = React.useState(false);

  const crumbs = buildBreadcrumbs(pathname);
  const isRoot = pathname === '/';
  const roleColor = ROLE_COLORS[user?.role ?? ''] ?? ROLE_COLORS.viewer;

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/60 px-6 flex items-center justify-between z-40">
      {/* Left: back button + breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        {!isRoot && (
          <button
            onClick={() => router.back()}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all mr-1"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.href}>
              {i > 0 && <ChevronRight className="w-3 h-3 text-gray-700 flex-shrink-0" />}
              {i === crumbs.length - 1 ? (
                <span className="text-white font-semibold truncate">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-gray-500 hover:text-gray-300 transition-colors truncate flex items-center gap-1"
                >
                  {i === 0 && <Home className="w-3 h-3 flex-shrink-0" />}
                  {i > 0 && crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <NotificationsBell />

        <div className="relative">
          <button
            onClick={() => setShowDropdown((p) => !p)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-gray-800/50 transition-all"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white leading-none">{user?.email || 'User'}</p>
              <p className={`text-[10px] px-1.5 py-0.5 rounded border inline-block mt-0.5 font-semibold ${roleColor}`}>
                {user?.role?.toUpperCase() || 'USER'}
              </p>
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-44 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden">
              <button
                onClick={() => { logout(); setShowDropdown(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
