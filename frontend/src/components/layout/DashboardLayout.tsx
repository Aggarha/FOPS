'use client';

import React from 'react';
import { EnhancedSidebar } from './EnhancedSidebar';
import { TopNav } from './TopNav';
import { AppShell } from './AppShell';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { loading } = useAuth();
  const isMobile = useIsMobile();

  // Show loading state while checking auth OR while viewport is undetermined
  if (loading || isMobile === null) {
    return (
      <div className="flex items-center justify-center h-screen-safe bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-green-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Mobile: AppShell with bottom nav + drawer ────────────────
  if (isMobile) {
    return <AppShell>{children}</AppShell>;
  }

  // ── Desktop: classic sidebar layout ──────────────────────────
  return (
    <div className="flex h-screen bg-black overflow-hidden">
      <EnhancedSidebar />
      <div className="flex-1 flex flex-col ml-72 min-w-0">
        <TopNav />
        <main className="flex-1 overflow-auto mt-16 bg-gradient-to-br from-gray-950 via-black to-gray-950">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

