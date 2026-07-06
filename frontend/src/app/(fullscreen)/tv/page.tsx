'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, WifiOff, Music, Disc3, TrendingUp, Layers, Mic2 } from 'lucide-react';
import { buildApiUrl } from '@/lib/runtime';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetRelease {
  date: string;
  day?: string;
  eg_time?: string;
  ksa_time?: string;
  upc?: string;
  artist: string;
  song: string;
  release_type: string;
  number_of_tracks?: string;
  delivery_operations?: string;
  delivery_motion_editing?: string;
  delivery_youtube?: string;
  label?: string;
  distribution_type?: string;
  google_drive_link?: string;
  metadata_status?: string;
  lyrics_status?: string;
}

interface UpcomingRelease extends SheetRelease {
  release_date: string;
}

interface TVData {
  today: string;
  today_releases: SheetRelease[];
  upcoming: UpcomingRelease[];
  stats: {
    total: number;
    singles: number;
    albums: number;
    eps: number;
    concerts: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeColor(t: string): string {
  switch ((t || '').toLowerCase()) {
    case 'single': return '#3b82f6';
    case 'album': return '#a855f7';
    case 'ep': return '#6366f1';
    case 'concert': return '#f97316';
    default: return '#6b7280';
  }
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * ease));
      if (progress < 1) requestAnimationFrame(frame);
      else prev.current = value;
    };
    requestAnimationFrame(frame);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

// ─── Burn-in Drift ────────────────────────────────────────────────────────────

function useBurnInDrift() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const MAX = 4;
    const iv = setInterval(() => {
      setOffset({
        x: Math.round((Math.random() - 0.5) * MAX * 2),
        y: Math.round((Math.random() - 0.5) * MAX * 2),
      });
    }, 20_000);
    return () => clearInterval(iv);
  }, []);
  return offset;
}

// ─── Today Release Slide ──────────────────────────────────────────────────────

function TodaySlide({ r, visible }: { r: SheetRelease; visible: boolean }) {
  const color = typeColor(r.release_type);
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease-in-out',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8vw',
      }}
    >
      {/* Glow */}
      <div style={{ position: 'absolute', top: '30%', left: '50%', width: '60vw', height: '60vw', borderRadius: '50%', background: `radial-gradient(ellipse, ${color}08 0%, transparent 70%)`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
          <span style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Today's Release</span>
        </div>

        <h2 style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 900, color: '#fff', lineHeight: 1.05, marginBottom: 16, letterSpacing: '-0.02em' }}>
          {r.song}
        </h2>
        <p style={{ fontSize: 'clamp(1.25rem, 2.5vw, 2rem)', color: '#9ca3af', fontWeight: 500, marginBottom: 32 }}>
          {r.artist}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ padding: '6px 16px', borderRadius: 999, border: `1px solid ${color}60`, background: `${color}20`, color, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {r.release_type || 'Release'}
          </span>
          {r.upc && (
            <span style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid #374151', background: '#111827', color: '#6b7280', fontSize: '0.7rem', fontFamily: 'monospace' }}>
              {r.upc}
            </span>
          )}
          {r.label && (
            <span style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid #374151', background: '#111827', color: '#9ca3af', fontSize: '0.75rem' }}>
              {r.label}
            </span>
          )}
          {r.eg_time && (
            <span style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid #1f2937', background: '#0f172a', color: '#6b7280', fontSize: '0.75rem' }}>
              EG {r.eg_time}
            </span>
          )}
        </div>

        {/* Pipeline status */}
        <div style={{ display: 'flex', gap: 24, marginTop: 32 }}>
          {[
            { label: 'Operations', val: r.delivery_operations || '' },
            { label: 'Motion/Edit', val: r.delivery_motion_editing || '' },
            { label: 'YouTube', val: r.delivery_youtube || '' },
          ].map(({ label, val }) => {
            const done = ['done', 'yes', '1', 'true'].includes(val.toLowerCase());
            const pend = ['pending', 'in progress', 'wip'].includes(val.toLowerCase());
            const dotColor = done ? '#10b981' : pend ? '#fbbf24' : val ? '#ef4444' : '#374151';
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ color: '#4b5563', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ color: done ? '#10b981' : pend ? '#fbbf24' : val ? '#ef4444' : '#374151', fontSize: '0.7rem', fontWeight: 600 }}>
                  {val || '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Upcoming Bar ─────────────────────────────────────────────────────────────

function UpcomingBar({ releases }: { releases: UpcomingRelease[] }) {
  return (
    <div style={{ display: 'flex', gap: 24, overflowX: 'hidden', paddingBottom: 4 }}>
      {releases.slice(0, 5).map((r, i) => {
        const days = daysUntil(r.release_date);
        const color = typeColor(r.release_type);
        return (
          <div key={i} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 12, border: '1px solid #1f2937', background: '#0f172a' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>{r.song}</span>
              <span style={{ color: '#6b7280', fontSize: '0.65rem' }}>{r.artist}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8 }}>
              <span style={{ color, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{r.release_type}</span>
              <span style={{ color: days <= 2 ? '#f97316' : days <= 5 ? '#fbbf24' : '#4b5563', fontSize: '0.65rem', fontWeight: 700 }}>
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `+${days}d`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats, loading }: { stats: TVData['stats'] | null; loading: boolean }) {
  const items = [
    { label: 'Total', value: stats?.total ?? 0, color: '#10b981', icon: TrendingUp },
    { label: 'Singles', value: stats?.singles ?? 0, color: '#3b82f6', icon: Music },
    { label: 'Albums', value: stats?.albums ?? 0, color: '#a855f7', icon: Disc3 },
    { label: 'EPs', value: stats?.eps ?? 0, color: '#6366f1', icon: Layers },
    { label: 'Concerts', value: stats?.concerts ?? 0, color: '#f97316', icon: Mic2 },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
      {items.map(({ label, value, color, icon: Icon }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Icon style={{ width: 16, height: 16, color, opacity: 0.7 }} />
          <span style={{ color, fontSize: 'clamp(1.25rem, 2vw, 2rem)', fontWeight: 900, lineHeight: 1 }}>
            {loading ? '—' : <AnimatedNumber value={value} />}
          </span>
          <span style={{ color: '#374151', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main TV Page ─────────────────────────────────────────────────────────────

export default function TVPage() {
  const [data, setData] = useState<TVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [slideIdx, setSlideIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const drift = useBurnInDrift();
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl('/api/tv/data'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 60s
  useEffect(() => {
    fetchData();
    const schedule = () => {
      pollRef.current = setTimeout(() => { fetchData(); schedule(); }, 60_000);
    };
    schedule();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [fetchData]);

  // Rotate today slides every 12s
  const todayCount = data?.today_releases.length ?? 0;
  useEffect(() => {
    if (todayCount <= 1) return;
    const iv = setInterval(() => setSlideIdx((i) => (i + 1) % todayCount), 12_000);
    return () => clearInterval(iv);
  }, [todayCount]);

  // Clock tick
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: '#030712',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transform: `translate(${drift.x}px, ${drift.y}px)`,
        transition: 'transform 3s ease-in-out',
      }}
    >
      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', borderBottom: '1px solid #0f172a', flexShrink: 0 }}>
        {/* Logo / title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: online ? '#10b981' : '#ef4444' }} />
          <span style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '0.2em', color: '#fff', textTransform: 'uppercase' }}>FOPS</span>
          <span style={{ fontSize: '0.65rem', color: '#374151', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Operations Center</span>
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.5rem)', fontWeight: 900, color: '#fff', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#4b5563', letterSpacing: '0.1em' }}>{dateStr}</div>
        </div>

        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {online
            ? <><Wifi style={{ width: 14, height: 14, color: '#10b981' }} /><span style={{ color: '#10b981', fontSize: '0.65rem', fontWeight: 700 }}>LIVE</span></>
            : <><WifiOff style={{ width: 14, height: 14, color: '#ef4444' }} /><span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700 }}>OFFLINE</span></>}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, border: '3px solid #1f2937', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#374151', fontSize: '0.875rem' }}>Loading release data…</p>
            </div>
          </div>
        ) : !online ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <WifiOff style={{ width: 48, height: 48, color: '#374151', margin: '0 auto 16px' }} />
              <p style={{ color: '#4b5563', fontSize: '1rem' }}>Connection lost — retrying…</p>
            </div>
          </div>
        ) : (data?.today_releases ?? []).length === 0 ? (
          /* No releases today — show stats prominently */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#374151', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>No Releases Today</p>
              <p style={{ color: '#1f2937', fontSize: '0.875rem' }}>Showing catalog overview</p>
            </div>
            <StatsBar stats={data?.stats ?? null} loading={loading} />
            {(data?.upcoming ?? []).length > 0 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#374151', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Next Up</p>
                <UpcomingBar releases={data!.upcoming} />
              </div>
            )}
          </div>
        ) : (
          /* Today releases carousel */
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {data!.today_releases.map((r, i) => (
              <TodaySlide key={i} r={r} visible={i === slideIdx} />
            ))}

            {/* Slide indicators */}
            {data!.today_releases.length > 1 && (
              <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
                {data!.today_releases.map((_, i) => (
                  <div key={i} style={{ width: i === slideIdx ? 24 : 8, height: 8, borderRadius: 999, background: i === slideIdx ? '#10b981' : '#1f2937', transition: 'all 0.5s ease' }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Bar ── */}
      <div style={{ borderTop: '1px solid #0f172a', padding: '16px 48px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Stats */}
        <StatsBar stats={data?.stats ?? null} loading={loading} />

        {/* Upcoming ticker */}
        {(data?.upcoming ?? []).length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#374151', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Upcoming</span>
              <div style={{ flex: 1, height: 1, background: '#111827' }} />
            </div>
            <UpcomingBar releases={data!.upcoming} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
