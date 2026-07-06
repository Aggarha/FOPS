'use client';

import React, { useState, useCallback } from 'react';
import { Menu, Bell, ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileDrawer } from './MobileDrawer';
import { MobileNav } from './MobileNav';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import NotificationsBell from '@/components/NotificationsBell';

const ROUTE_LABELS: Record<string, string> = {
  '':               'Dashboard',
  'dashboard':      'Operations',
  'tools':          'Tools',
  'communications': 'Communications',
  'logs':           'Activity Logs',
  'operations':     'Operations',
  'live-logs':      'Live Logs',
  'settings':       'Settings',
  'control':        'Control Panel',
  'kiosk':          'Kiosk',
  'tv':             'TV Mode',
  'audio-match':    'Audio Match',
  'channel-scrape': 'Channel Scraper',
  'fingerprint-db': 'Fingerprint DB',
  'monitoring':     'Monitoring',
  'publishing':     'Publishing Suite',
  'publishing-hub': 'Publishing Hub',
  'protection':     'Protection',
  'youtube-search': 'YT Search',
  'audit':          'Audit',
  'notifications':  'Notifications',
  'timeline':       'Timeline',
  'users':          'Users',
  'operations-center': 'Operations Center',
};

function getSegmentLabel(seg: string): string {
  return ROUTE_LABELS[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getPageTitle(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return 'Dashboard';
  return getSegmentLabel(segs[segs.length - 1]);
}

function getParentPath(pathname: string): string | null {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs.length === 1) return '/';
  return '/' + segs.slice(0, -1).join('/');
}

interface MobileTopBarProps {
  onMenuOpen: () => void;
}

function MobileTopBar({ onMenuOpen }: MobileTopBarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const title    = getPageTitle(pathname);
  const isHome   = pathname === '/';
  const parentPath = getParentPath(pathname);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 glass border-b border-gray-800/50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left: hamburger on home, back button on sub-pages */}
        {isHome ? (
          <button
            onClick={onMenuOpen}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all active:scale-95"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => parentPath ? router.push(parentPath) : router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onMenuOpen}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800/40 transition-all active:scale-95"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Title */}
        <div className="flex items-center gap-2">
          {isHome && (
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center font-bold text-black text-xs">
              F
            </div>
          )}
          <span className="text-sm font-bold text-white tracking-wide">{title}</span>
        </div>

        {/* Right: notifications */}
        <div className="flex items-center gap-1">
          <NotificationsBell />
        </div>
      </div>
    </header>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex flex-col h-screen-safe bg-black overflow-hidden">
      {/* Mobile top bar */}
      <MobileTopBar onMenuOpen={openDrawer} />

      {/* Slide drawer */}
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} />

      {/* Scrollable page content — padded for top bar + bottom nav */}
      <main
        className="flex-1 overflow-y-auto scroll-smooth-ios"
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          paddingLeft:  'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="min-h-full bg-gradient-to-br from-gray-950 via-black to-gray-950 p-4">
          {children}
        </div>
      </main>

      {/* Bottom nav */}
      <MobileNav />

      {/* PWA install prompt */}
      <PWAInstallPrompt />
    </div>
  );
}
