"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { authenticatedFetch } from '@/lib/api';

/* ────── types ────── */

interface JobProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
}

interface Job {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: JobProgress;
  result?: any;
  error?: string;
}

interface MatchCandidate {
  title: string;
  artist: string;
  url: string;
  platform: string;
  score: number;
  duration: number;
  views: number;
  video_id: string;
  fingerprint_confidence?: number | null;
  original_score?: number;
}

interface Alert {
  type: "danger" | "warning" | "success" | "info";
  message: string;
  reason: string;
}

interface MatchResult {
  success: boolean;
  best_match: MatchCandidate | null;
  confidence: number;
  verified: boolean;
  method: string;
  matches: MatchCandidate[];
  matches_count: number;
  fingerprint_runs: number;
  cache_hit: boolean;
  search_mode: string;
  platforms_searched: string[];
  alerts?: Alert[];
}

interface BatchItem {
  artist: string;
  song: string;
}

interface BatchResult {
  success: boolean;
  results: Array<{
    artist: string;
    song: string;
    result: MatchResult | null;
    error?: string;
  }>;
  total: number;
  successful: number;
  failed: number;
  duration: number;
}

/* ────── helpers ────── */

function confidenceColor(c: number): string {
  if (c >= 90) return "#22c55e";
  if (c >= 70) return "#eab308";
  return "#ef4444";
}

function confidenceBg(c: number): string {
  if (c >= 90) return "rgba(34,197,94,0.12)";
  if (c >= 70) return "rgba(234,179,8,0.12)";
  return "rgba(239,68,68,0.12)";
}

function formatDuration(s: number): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(Math.floor(sec)).padStart(2, "0")}`;
}

function formatViews(v: number): string {
  if (!v || v <= 0) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

const PLATFORMS = ["youtube", "spotify", "anghami"] as const;

/* ────── main page ────── */

export default function AudioMatchPage() {
  /* mode state */
  const [mode, setMode] = useState<"manual" | "batch">("manual");

  /* manual mode state */
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["youtube"]);
  const [useFingerprint, setUseFingerprint] = useState(true);

  /* batch mode state */
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* result state */
  const [result, setResult] = useState<MatchResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  /* job tracking state */
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<Job | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* poll job status every 1 second */
  useEffect(() => {
    if (!jobId) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const pollJob = async () => {
      try {
        const res = await authenticatedFetch(`/api/jobs/${jobId}`);

        if (!res.ok) {
          return;
        }

        const job: Job = await res.json();
        setJobStatus(job);

        /* stop polling when done */
        if (job.status === "completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          /* convert job result to batch result format */
          if (job.result) {
            setBatchResult(job.result as BatchResult);
          }
          setLoading(false);
        } else if (job.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(job.error || "Batch processing failed");
          setLoading(false);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    /* start polling immediately */
    pollJob();
    pollIntervalRef.current = setInterval(pollJob, 1000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [jobId]);

  /* cleanup on unmount */
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  /* toggle platform */
  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
    );
  };

  /* manual mode: add song input */
  const addSongInput = () => {
    setBatchItems([...batchItems, { artist: "", song: "" }]);
  };

  /* manual mode: remove song input */
  const removeSongInput = (index: number) => {
    setBatchItems(batchItems.filter((_, i) => i !== index));
  };

  /* manual mode: update song input */
  const updateSongInput = (index: number, field: "artist" | "song", value: string) => {
    const updated = [...batchItems];
    updated[index][field] = value;
    setBatchItems(updated);
  };

  /* batch mode: handle file upload */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchFile(file);
    setError(null);

    try {
      if (file.name.endsWith(".csv")) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const items = (result.data as Record<string, string>[])
              .map((row) => ({
                artist: row.artist || row.Artist || row.ARTIST || "",
                song: row.song || row.Song || row.SONG || row.title || row.Title || row.TITLE || "",
              }))
              .filter((item) => item.artist.trim() && item.song.trim());

            if (items.length === 0) {
              setError("No valid songs found in file. Ensure columns are named 'Artist' and 'Song' (or 'Title').");
              return;
            }

            setBatchItems(items);
          },
          error: (err) => {
            setError(`CSV parse error: ${err.message}`);
          },
        });
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setError("XLSX support coming soon. Please use CSV for now.");
      } else {
        setError("Please upload a CSV file.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "File upload failed");
    }
  };

  /* submit single match */
  const handleSubmit = async () => {
    if (!song.trim() || !artist.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await authenticatedFetch('/api/tools/audio-match', {
        method: "POST",
        body: JSON.stringify({
          song,
          artist,
          platforms,
          use_fingerprint: useFingerprint,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `HTTP ${res.status}`);
      }
      const data: MatchResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
    setLoading(false);
  };

  /* submit batch */
  const handleBatchSubmit = async () => {
    if (batchItems.length === 0) {
      setError("Please add at least one song");
      return;
    }

    setLoading(true);
    setError(null);
    setBatchResult(null);
    setJobStatus(null);

    try {
      const res = await authenticatedFetch('/api/tools/audio-match/batch', {
        method: "POST",
        body: JSON.stringify({
          items: batchItems,
          platforms,
          use_fingerprint: useFingerprint,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      /* store job_id to start polling */
      setJobId(data.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch request failed");
      setLoading(false);
    }
  };

  return (
    <div className="text-white flex flex-col gap-5">
      {/* ── header ── */}
      <header className="flex items-center gap-3">
        <h1 className="text-xl md:text-2xl font-black tracking-wider">
          <span style={{ color: "#39ff14" }}>FOPS</span>{" "}
          <span className="text-neutral-400 font-medium">Audio Match {mode === "batch" && "· Batch"}</span>
        </h1>
      </header>

      {/* ── mode toggle ── */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
        <label className="text-xs text-neutral-500 block mb-3">MODE</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMode("manual");
              setBatchResult(null);
              setResult(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold transition border"
            style={{
              background: mode === "manual" ? "rgba(57,255,20,0.12)" : "transparent",
              borderColor: mode === "manual" ? "#39ff14" : "#333",
              color: mode === "manual" ? "#39ff14" : "#666",
            }}
          >
            Manual Entry
          </button>
          <button
            onClick={() => {
              setMode("batch");
              setResult(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold transition border"
            style={{
              background: mode === "batch" ? "rgba(57,255,20,0.12)" : "transparent",
              borderColor: mode === "batch" ? "#39ff14" : "#333",
              color: mode === "batch" ? "#39ff14" : "#666",
            }}
          >
            Upload File
          </button>
        </div>
      </div>

      {/* ── job progress tracking ── */}
      {jobStatus && (jobStatus.status === "pending" || jobStatus.status === "running") && (
        <div className="bg-neutral-950 border border-yellow-500/30 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5" style={{ color: "#39ff14" }} viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-neutral-200">Batch Processing</h3>
              <p className="text-xs text-neutral-500 mt-1">
                {jobStatus.progress?.stage || "preparing"} · {jobStatus.progress?.current || 0}/{jobStatus.progress?.total || 0} items
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold" style={{ color: "#39ff14" }}>
                {Math.round(jobStatus.progress?.percentage || 0)}%
              </div>
              <div className="text-xs text-neutral-500">in progress</div>
            </div>
          </div>

          {/* progress bar */}
          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.round(jobStatus.progress?.percentage || 0)}%`,
                background: "#39ff14",
              }}
            />
          </div>

          {/* stage details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-neutral-900/50 rounded-lg p-2 border border-neutral-800">
              <div className="text-neutral-500">Stage</div>
              <div className="text-white font-mono text-[11px] mt-0.5 truncate">
                {jobStatus.progress?.stage || "—"}
              </div>
            </div>
            <div className="bg-neutral-900/50 rounded-lg p-2 border border-neutral-800">
              <div className="text-neutral-500">Progress</div>
              <div className="text-white font-mono text-[11px] mt-0.5">
                {jobStatus.progress?.current || 0}/{jobStatus.progress?.total || 0}
              </div>
            </div>
            <div className="bg-neutral-900/50 rounded-lg p-2 border border-neutral-800 col-span-2 md:col-span-2">
              <div className="text-neutral-500">Message</div>
              <div className="text-white text-[11px] mt-0.5 truncate">
                {jobStatus.progress?.message || "Processing..."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── manual mode ── */}
      {mode === "manual" && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-4">
          {/* artist + song inputs */}
          <div className="flex flex-col gap-4">
            {batchItems.length === 0 ? (
              // Single input mode
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Artist *</label>
                  <input
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 transition"
                    placeholder="e.g. Amr Diab"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Song *</label>
                  <input
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 transition"
                    placeholder="e.g. Tamally Maak"
                    value={song}
                    onChange={(e) => setSong(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
              </div>
            ) : (
              // Multiple inputs mode
              <div className="flex flex-col gap-3">
                {batchItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">Artist</label>
                      <input
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 transition"
                        placeholder="Artist"
                        value={item.artist}
                        onChange={(e) => updateSongInput(idx, "artist", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">Song</label>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 transition"
                          placeholder="Song"
                          value={item.song}
                          onChange={(e) => updateSongInput(idx, "song", e.target.value)}
                        />
                        <button
                          onClick={() => removeSongInput(idx)}
                          className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition text-sm font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* platforms + fingerprint */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">Platforms</label>
              <div className="flex gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition border"
                    style={{
                      background: platforms.includes(p) ? "rgba(57,255,20,0.12)" : "transparent",
                      borderColor: platforms.includes(p) ? "#39ff14" : "#333",
                      color: platforms.includes(p) ? "#39ff14" : "#666",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 md:mt-0">
              <label className="text-xs text-neutral-500">Fingerprint</label>
              <button
                onClick={() => setUseFingerprint(!useFingerprint)}
                className="relative w-10 h-5 rounded-full transition"
                style={{ background: useFingerprint ? "#39ff14" : "#333" }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: useFingerprint ? "22px" : "2px" }}
                />
              </button>
              <span className="text-xs" style={{ color: useFingerprint ? "#39ff14" : "#666" }}>
                {useFingerprint ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          {/* add/submit buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={addSongInput}
              className="px-4 py-2.5 rounded-lg font-bold text-sm transition border border-green-500/50 text-green-400 hover:bg-green-500/10"
            >
              + Add Song
            </button>

            <button
              onClick={batchItems.length === 0 ? handleSubmit : handleBatchSubmit}
              disabled={loading || (batchItems.length === 0 && (!song.trim() || !artist.trim()))}
              className="px-6 py-2.5 rounded-lg font-bold text-sm transition disabled:opacity-40"
              style={{ background: loading ? "#333" : "#39ff14", color: "#000" }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {batchItems.length === 0 ? "Matching…" : `Processing (${batchItems.length})…`}
                </span>
              ) : batchItems.length === 0 ? (
                "🎵 Run Audio Match"
              ) : (
                `🎵 Run Batch (${batchItems.length} songs)`
              )}
            </button>
          </div>
        </section>
      )}

      {/* ── batch/upload mode ── */}
      {mode === "batch" && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-4">
          {/* file upload */}
          <div>
            <label className="text-xs text-neutral-500 block mb-3">Upload CSV File</label>
            <div
              className="border-2 border-dashed border-neutral-700 rounded-xl p-6 text-center cursor-pointer hover:border-green-500/50 transition"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-neutral-400">
                  {batchFile ? `📄 ${batchFile.name}` : "Drop CSV file or click to upload"}
                </p>
                <p className="text-xs text-neutral-600">CSV with Artist and Song columns</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* batch items preview */}
          {batchItems.length > 0 && (
            <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs text-neutral-500 block">Loaded Songs ({batchItems.length})</label>
                <button
                  onClick={() => {
                    setBatchItems([]);
                    setBatchFile(null);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-700">
                      <th className="text-left px-3 py-1 text-neutral-500">#</th>
                      <th className="text-left px-3 py-1 text-neutral-500">Artist</th>
                      <th className="text-left px-3 py-1 text-neutral-500">Song</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-neutral-800/50">
                        <td className="px-3 py-2 text-neutral-500">{idx + 1}</td>
                        <td className="px-3 py-2 text-neutral-300 truncate">{item.artist}</td>
                        <td className="px-3 py-2 text-neutral-300 truncate">{item.song}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* platforms + fingerprint */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">Platforms</label>
              <div className="flex gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition border"
                    style={{
                      background: platforms.includes(p) ? "rgba(57,255,20,0.12)" : "transparent",
                      borderColor: platforms.includes(p) ? "#39ff14" : "#333",
                      color: platforms.includes(p) ? "#39ff14" : "#666",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 md:mt-0">
              <label className="text-xs text-neutral-500">Fingerprint</label>
              <button
                onClick={() => setUseFingerprint(!useFingerprint)}
                className="relative w-10 h-5 rounded-full transition"
                style={{ background: useFingerprint ? "#39ff14" : "#333" }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: useFingerprint ? "22px" : "2px" }}
                />
              </button>
              <span className="text-xs" style={{ color: useFingerprint ? "#39ff14" : "#666" }}>
                {useFingerprint ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          {/* submit button */}
          <button
            onClick={handleBatchSubmit}
            disabled={loading || batchItems.length === 0}
            className="px-6 py-2.5 rounded-lg font-bold text-sm transition disabled:opacity-40 self-start"
            style={{ background: loading ? "#333" : "#39ff14", color: "#000" }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing {batchItems.length} songs…
              </span>
            ) : (
              `🎵 Run Batch (${batchItems.length} songs)`
            )}
          </button>
        </section>
      )}

      {/* ── error state ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-3">✕</button>
        </div>
      )}

      {/* ── single result ── */}
      {result && mode === "manual" && batchItems.length === 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">Match Result</h2>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>Confidence: <span style={{ color: confidenceColor(result.confidence) }} className="text-white">{result.confidence}%</span></span>
              <span style={{ color: result.verified ? "#22c55e" : "#666" }}>{result.verified ? "✓ VERIFIED" : "UNVERIFIED"}</span>
            </div>
          </div>

          {result.best_match ? (
            <div className="flex flex-col md:flex-row gap-5">
              <div className="flex-1 flex flex-col gap-4">
                {/* Audio Waveform Visualization */}
                <div className="flex flex-col gap-2">
                  <a
                    href={result.best_match.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline transition text-lg font-medium"
                  >
                    {result.best_match.title}
                  </a>
                  <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
                    <span>Channel: <span className="text-white">{result.best_match.artist}</span></span>
                    <span>Platform: <span className="text-white">{result.best_match.platform}</span></span>
                    <span>Duration: <span className="text-white">{formatDuration(result.best_match.duration)}</span></span>
                    <span>Views: <span className="text-white">{formatViews(result.best_match.views)}</span></span>
                  </div>
                </div>
              </div>
            </div>
            ) : (
              <p className="text-neutral-500 text-center py-8">No match found</p>
            )}
        </div>
      )}

      {/* ── batch results ── */}
      {batchResult && (
        <div className="flex flex-col gap-4">
          {/* completion header */}
          <div className="bg-neutral-950 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <h2 className="text-sm font-bold text-neutral-200">Batch Complete</h2>
                  <p className="text-xs text-neutral-500 mt-1">All songs processed</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setJobId(null);
                  setJobStatus(null);
                  setBatchResult(null);
                  setError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold transition border border-green-500/50 text-green-400 hover:bg-green-500/10"
              >
                Start New Batch
              </button>
            </div>
          </div>

          {/* results table */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">Batch Results</h2>
              <div className="flex gap-4 text-xs text-neutral-500">
                <span>Total: <span className="text-white">{batchResult.total}</span></span>
                <span style={{ color: "#22c55e" }}>✓ Success: {batchResult.successful}</span>
                <span style={{ color: batchResult.failed > 0 ? "#ef4444" : "#22c55e" }}>Failed: {batchResult.failed}</span>
                <span>Time: <span className="text-white">{(batchResult.duration / 1000).toFixed(2)}s</span></span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2">#</th>
                    <th className="text-left px-4 py-2">Artist</th>
                    <th className="text-left px-4 py-2">Song</th>
                    <th className="text-left px-4 py-2">Match</th>
                    <th className="text-center px-4 py-2">Confidence</th>
                    <th className="text-center px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResult.results.map((item, idx) => (
                    <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition">
                      <td className="px-4 py-2 text-neutral-500">{idx + 1}</td>
                      <td className="px-4 py-2 text-neutral-300 max-w-[150px] truncate">{item.artist}</td>
                      <td className="px-4 py-2 text-neutral-300 max-w-[150px] truncate">{item.song}</td>
                      <td className="px-4 py-2">
                        {item.result?.best_match ? (
                          <a
                            href={item.result.best_match.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 truncate block max-w-[250px]"
                          >
                            {item.result.best_match.title}
                          </a>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {item.result ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full font-bold"
                            style={{
                              background: confidenceBg(item.result.confidence),
                              color: confidenceColor(item.result.confidence),
                            }}
                          >
                            {item.result.confidence}%
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {item.error ? (
                          <span className="text-red-400 text-[10px]" title={item.error}>⚠ Error</span>
                        ) : (
                          <span className="text-green-400 text-[10px]">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── empty state ── */}
      {!result && !batchResult && !loading && !error && mode === "manual" && batchItems.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-3 py-16">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-sm">Enter an artist and song to run audio matching</p>
          <p className="text-xs text-neutral-700">Or use "Add Song" button for batch processing</p>
        </div>
      )}

      {/* ── footer ── */}
      <footer className="text-center text-[10px] text-neutral-700 py-2 mt-auto">
        FOPS Audio Match {mode === "batch" && "· Batch Mode"} · {batchResult ? `${batchResult.successful}/${batchResult.total} matched` : result ? "Single match complete" : "Ready"}
      </footer>
    </div>
  );
}
