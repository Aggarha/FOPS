'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSheetReleases, fetchStats } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Release {
  song: string;
  artist: string;
  type: string;
  upc?: string;
  release_date?: string;
  formatted_date?: string;
  weekday?: string;
  artwork_status?: string;
  motion_status?: string;
  youtube_status?: string;
  delivery_operations?: string;
  delivery_motion_editing?: string;
  cairo_team?: string;
  saudi_team?: string;
}

export interface Overview {
  total_releases: number;
  singles: number;
  albums: number;
  eps: number;
  mv: number;
  lyrics_videos: number;
  ai: number;
  upcoming_releases: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function statusColor(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'done' || s === 'completed' || s === 'approved') return 'text-green-400';
  if (s === 'pending' || s === 'in progress') return 'text-yellow-400';
  if (s === 'failed' || s === 'rejected') return 'text-red-400';
  if (s === 'not required' || s === 'n/a' || s === '-') return 'text-gray-600';
  return 'text-gray-400';
}

export function statusDot(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'done' || s === 'completed' || s === 'approved') return 'bg-green-500';
  if (s === 'pending' || s === 'in progress') return 'bg-yellow-500';
  if (s === 'failed' || s === 'rejected') return 'bg-red-500';
  if (s === 'not required' || s === 'n/a' || s === '-') return 'bg-gray-800';
  return 'bg-gray-600';
}

export function releaseTypeColor(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('single')) return 'border-blue-700/50 text-blue-400 bg-blue-950/30';
  if (t.includes('album')) return 'border-purple-700/50 text-purple-400 bg-purple-950/30';
  if (t.includes('ep')) return 'border-indigo-700/50 text-indigo-400 bg-indigo-950/30';
  if (t.includes('concert')) return 'border-orange-700/50 text-orange-400 bg-orange-950/30';
  if (t.includes('mv') || t.includes('video')) return 'border-pink-700/50 text-pink-400 bg-pink-950/30';
  if (t.includes('lyric')) return 'border-yellow-700/50 text-yellow-400 bg-yellow-950/30';
  if (t.includes('ai')) return 'border-cyan-700/50 text-cyan-400 bg-cyan-950/30';
  return 'border-gray-700/50 text-gray-400 bg-gray-900/30';
}

// Map SheetRelease fields to our Release shape
function mapSheetRelease(r: Awaited<ReturnType<typeof fetchSheetReleases>>[0]): Release {
  return {
    song: r.song || '',
    artist: r.artist || '',
    type: r.release_type || '',
    upc: r.upc,
    release_date: r.date,
    formatted_date: r.date,
    weekday: r.day,
    artwork_status: r.metadata_status || '',
    motion_status: r.motion_graphics || '',
    youtube_status: r.delivery_youtube || '',
    delivery_operations: r.delivery_operations || '',
    delivery_motion_editing: r.delivery_motion_editing || '',
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDashboard(pollingMs = 60_000) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [allReleases, setAllReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [allLoading, setAllLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await fetchStats();
      setOverview({
        total_releases: data.total ?? 0,
        singles: data.singles ?? 0,
        albums: data.albums ?? 0,
        eps: data.eps ?? 0,
        mv: data.mv ?? 0,
        lyrics_videos: data.lyrics_videos ?? 0,
        ai: data.ai ?? 0,
        upcoming_releases: (data as any).upcoming ?? 0,
      });
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const sheet = await fetchSheetReleases();
      setAllReleases(sheet.map(mapSheetRelease));
    } catch {
      // non-fatal
    } finally {
      setAllLoading(false);
      setLastFetched(new Date());
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setAllLoading(true);
    fetchOverview();
    fetchAll();
  }, [fetchOverview, fetchAll]);

  useEffect(() => {
    refresh();
    if (pollingMs > 0) {
      timerRef.current = setInterval(refresh, pollingMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, pollingMs]);

  return { overview, allReleases, allLoading, loading, refresh, lastFetched };
}
