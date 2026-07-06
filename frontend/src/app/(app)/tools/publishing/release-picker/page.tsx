'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, Music, ChevronRight, Loader2, X, RefreshCw,
  ArrowRight, Filter, Hash, User, Disc3, Calendar,
  CheckCircle, SlidersHorizontal, Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface PublishingRelease {
  id: number;
  source_id: number;
  import_uid: string;
  row_index: number;
  artist_en: string;
  artist_ar: string;
  song_en: string;
  song_ar: string;
  album_en: string;
  album_ar: string;
  upc: string;
  isrc: string;
  genre: string;
  nationality: string;
  release_date: string;
  duration: string;
  track_number: string;
  track_count: string;
  songwriter_en: string;
  songwriter_ar: string;
  composer_en: string;
  composer_ar: string;
  arranger_en: string;
  arranger_ar: string;
}

interface SearchResult {
  success: boolean;
  total: number;
  offset: number;
  limit: number;
  releases: PublishingRelease[];
}

const PAGE_SIZE = 25;

export default function ReleasePickerPage() {
  const router = useRouter();

  // Search state
  const [q, setQ] = useState('');
  const [artist, setArtist] = useState('');
  const [song, setSong] = useState('');
  const [upc, setUpc] = useState('');
  const [isrc, setIsrc] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);

  // Results state
  const [results, setResults] = useState<PublishingRelease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PublishingRelease | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((currentOffset = 0) => {
    const p = new URLSearchParams();
    if (q.trim())      p.set('q',      q.trim());
    if (artist.trim()) p.set('artist', artist.trim());
    if (song.trim())   p.set('song',   song.trim());
    if (upc.trim())    p.set('upc',    upc.trim());
    if (isrc.trim())   p.set('isrc',   isrc.trim());
    p.set('limit',  String(PAGE_SIZE));
    p.set('offset', String(currentOffset));
    return p.toString();
  }, [q, artist, song, upc, isrc]);

  const doSearch = useCallback(async (currentOffset = 0) => {
    const params = buildParams(currentOffset);
    const hasAnyFilter = q.trim() || artist.trim() || song.trim() || upc.trim() || isrc.trim();
    if (!hasAnyFilter) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const data: SearchResult = await apiFetch(`/api/publishing/releases/search?${params}`);
      setResults(data.releases ?? []);
      setTotal(data.total ?? 0);
      setOffset(currentOffset);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams, q, artist, song, upc, isrc]);

  // Debounced search on main query change
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (q.trim() || artist.trim() || song.trim() || upc.trim() || isrc.trim()) {
        doSearch(0);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, artist, song, upc, isrc, doSearch]);

  const handleUseRelease = (release: PublishingRelease) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('publishing_autofill', JSON.stringify(release));
    }
    router.push('/tools/publishing?autofill=1');
  };

  const clearFilters = () => {
    setArtist('');
    setSong('');
    setUpc('');
    setIsrc('');
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6 max-w-screen-xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
          <Link href="/tools/publishing" className="hover:text-gray-400 transition">Publishing Suite</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-400">Release Picker</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Release Picker</h1>
            <p className="text-sm text-gray-500 mt-1">
              Search your imported metadata records and autofill the Publishing Suite
            </p>
          </div>
          <Link href="/tools/publishing"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-sm transition">
            <Zap className="w-4 h-4" /> Publishing Suite
          </Link>
        </div>
      </div>

      {/* Search + filters */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="p-4 space-y-3">
          {/* Main search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by artist, song, UPC, ISRC…"
              autoFocus
              className="w-full pl-10 pr-10 py-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-600 transition"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {loading && <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />}
              {q && !loading && (
                <button onClick={() => setQ('')} className="text-gray-600 hover:text-white p-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold transition px-2 py-1 rounded ${showFilters ? 'text-green-400 bg-green-900/20' : 'text-gray-600 hover:text-gray-400'}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Advanced Filters
              {(artist || song || upc || isrc) && (
                <span className="ml-1 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {[artist, song, upc, isrc].filter(Boolean).length}
                </span>
              )}
            </button>
            {(artist || song || upc || isrc) && (
              <button onClick={clearFilters} className="text-[10px] text-red-500 hover:text-red-400 transition">
                Clear filters
              </button>
            )}
          </div>

          {/* Advanced filter fields */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-gray-800">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
                  <User className="w-2.5 h-2.5" /> Artist
                </label>
                <input value={artist} onChange={e => setArtist(e.target.value)}
                  placeholder="Artist name…"
                  className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-green-700 transition" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
                  <Music className="w-2.5 h-2.5" /> Song
                </label>
                <input value={song} onChange={e => setSong(e.target.value)}
                  placeholder="Song title…"
                  className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-green-700 transition" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" /> UPC
                </label>
                <input value={upc} onChange={e => setUpc(e.target.value)}
                  placeholder="UPC code…"
                  className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-700 font-mono focus:outline-none focus:border-green-700 transition" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" /> ISRC
                </label>
                <input value={isrc} onChange={e => setIsrc(e.target.value)}
                  placeholder="ISRC code…"
                  className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-700 font-mono focus:outline-none focus:border-green-700 transition" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {!hasSearched && (
        <div className="text-center py-20 text-gray-700">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-bold">Start typing to search releases</p>
          <p className="text-xs mt-1">Search across all your imported metadata records</p>
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl text-gray-700">
          <Music className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-bold">No releases found</p>
          <p className="text-xs mt-1">Try different search terms or import records via Source Library</p>
          <Link href="/tools/publishing/sources" className="inline-flex items-center gap-1.5 mt-3 text-xs text-green-500 hover:text-green-400 transition">
            Go to Source Library <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">
              {total} result{total !== 1 ? 's' : ''}
              {total > PAGE_SIZE && ` · page ${currentPage} of ${totalPages}`}
            </p>
            {selected && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                1 release selected
              </div>
            )}
          </div>

          <div className="space-y-2">
            {results.map((r) => (
              <ReleaseCard
                key={r.id}
                release={r}
                selected={selected?.id === r.id}
                onSelect={() => setSelected(r)}
                onUse={() => handleUseRelease(r)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={offset === 0}
                onClick={() => doSearch(Math.max(0, offset - PAGE_SIZE))}
                className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 disabled:opacity-30 transition"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-600">{currentPage} / {totalPages}</span>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => doSearch(offset + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 disabled:opacity-30 transition"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Sticky use button when something is selected */}
      {selected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-gray-900 border border-green-700 shadow-2xl shadow-black/50">
          <div className="text-sm">
            <p className="font-bold text-white">{selected.song_en || selected.song_ar}</p>
            <p className="text-xs text-gray-400">{selected.artist_en || selected.artist_ar}</p>
          </div>
          <button
            onClick={() => handleUseRelease(selected)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-sm transition"
          >
            <Zap className="w-4 h-4" />
            Use in Publishing Suite
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ReleaseCard({
  release, selected, onSelect, onUse,
}: {
  release: PublishingRelease;
  selected: boolean;
  onSelect: () => void;
  onUse: () => void;
}) {
  const title   = release.song_en   || release.song_ar   || '(untitled)';
  const artist  = release.artist_en || release.artist_ar || '—';
  const album   = release.album_en  || release.album_ar  || null;

  const tags = [
    release.genre && { label: release.genre, color: 'bg-blue-900/30 text-blue-400 border-blue-800' },
    release.nationality && { label: release.nationality, color: 'bg-purple-900/30 text-purple-400 border-purple-800' },
    release.release_date && { label: release.release_date, color: 'bg-gray-800 text-gray-500 border-gray-700' },
  ].filter(Boolean) as { label: string; color: string }[];

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 cursor-pointer transition-all ${
        selected
          ? 'border-green-700 bg-green-950/20'
          : 'border-gray-800 bg-gray-950 hover:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Album art placeholder */}
        <div className="w-12 h-12 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0">
          <Music className="w-5 h-5 text-gray-700" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{title}</p>
              {release.song_ar && release.song_en && (
                <p className="text-xs text-gray-500 truncate" dir="rtl">{release.song_ar}</p>
              )}
              <p className="text-sm text-gray-400 truncate mt-0.5">{artist}</p>
              {release.artist_ar && release.artist_en && (
                <p className="text-[11px] text-gray-600 truncate" dir="rtl">{release.artist_ar}</p>
              )}
            </div>

            {/* Action */}
            <button
              onClick={(e) => { e.stopPropagation(); onUse(); }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/40 hover:bg-green-700 border border-green-800 hover:border-green-600 text-green-400 hover:text-white text-xs font-bold transition"
            >
              <Zap className="w-3 h-3" /> Use
            </button>
          </div>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-3 mt-2">
            {album && (
              <span className="flex items-center gap-1 text-[10px] text-gray-600">
                <Disc3 className="w-2.5 h-2.5" /> {album}
              </span>
            )}
            {release.upc && (
              <span className="text-[10px] font-mono text-gray-700">UPC: {release.upc}</span>
            )}
            {release.isrc && (
              <span className="text-[10px] font-mono text-gray-700">ISRC: {release.isrc}</span>
            )}
            {release.track_number && (
              <span className="text-[10px] text-gray-700">Track {release.track_number}{release.track_count ? `/${release.track_count}` : ''}</span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((t) => (
                <span key={t.label}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${t.color}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}

          {/* Credits summary */}
          {(release.songwriter_en || release.composer_en) && (
            <p className="text-[10px] text-gray-700 mt-2 truncate">
              {release.songwriter_en && `Writer: ${release.songwriter_en}`}
              {release.songwriter_en && release.composer_en && ' · '}
              {release.composer_en && `Composer: ${release.composer_en}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
