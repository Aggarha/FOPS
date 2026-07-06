"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authenticatedFetch } from "@/lib/api";

interface PipelineResult {
  data: {
    song: string;
    artist: string;
  };
  decisions: {
    best_match: {
      title: string;
      url: string;
      platform: string;
    } | null;
    confidence: number;
    verified: boolean;
    reason: string;
    alternatives: any[];
  };
  auto_suggestion?: {
    suggested_action: string;
    confidence: number;
    reason: string;
  };
  alerts: string[];
}

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

export default function ControlPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [artist, setArtist] = useState("");
  const [song, setSong] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [showAlternatives, setShowAlternatives] = useState<Record<number, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<number, string>>({});

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const runPipeline = async () => {
    if (!artist.trim() && !song.trim()) {
      setError("Please enter artist or song");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const response = await authenticatedFetch('/api/run-agents', {
        method: "POST",
        body: JSON.stringify({
          artist: artist.trim(),
          song: song.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.data) {
        setResults([data.data]);
      } else {
        setError("No results returned");
      }
    } catch (err: any) {
      setError(err.message || "Pipeline failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (idx: number) => {
    setActionFeedback((prev) => ({ ...prev, [idx]: "approved" }));
  };

  const handleReject = (idx: number) => {
    setActionFeedback((prev) => ({ ...prev, [idx]: "rejected" }));
  };

  const handleRerun = (idx: number) => {
    setActionFeedback((prev) => ({ ...prev, [idx]: "" }));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Control Panel</h1>
          <p className="text-neutral-400 text-sm mt-1">Search and manage audio matches</p>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Artist
            </label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPipeline()}
              placeholder="e.g. Luis Fonsi"
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Song
            </label>
            <input
              type="text"
              value={song}
              onChange={(e) => setSong(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPipeline()}
              placeholder="e.g. Despacito"
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition"
            />
          </div>
          <button
            onClick={runPipeline}
            disabled={loading}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold rounded-lg transition whitespace-nowrap"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <svg
                className="animate-spin h-8 w-8 text-green-400"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="text-neutral-400 text-sm">Running audio matching pipeline…</p>
            </div>
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && !loading && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wider bg-neutral-900/50">
                    <th className="text-left px-4 py-3">Song</th>
                    <th className="text-left px-4 py-3">Artist</th>
                    <th className="text-left px-4 py-3">Best Match</th>
                    <th className="text-center px-4 py-3">Confidence</th>
                    <th className="text-center px-4 py-3">Verified</th>
                    <th className="text-center px-4 py-3">Suggestion</th>
                    <th className="text-center px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const d = r.decisions;
                    const best = d?.best_match;
                    const confidence = d?.confidence ?? 0;
                    const feedback = actionFeedback[idx];

                    return (
                      <tr
                        key={idx}
                        className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition"
                        style={
                          feedback
                            ? {
                                background:
                                  feedback === "approved"
                                    ? "rgba(34,197,94,0.06)"
                                    : "rgba(239,68,68,0.06)",
                              }
                            : undefined
                        }
                      >
                        <td className="px-4 py-3 font-medium text-white">{r.data.song || "—"}</td>
                        <td className="px-4 py-3 text-neutral-400">{r.data.artist || "—"}</td>
                        <td className="px-4 py-3 max-w-xs">
                          {best ? (
                            <a
                              href={best.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 hover:underline truncate block"
                              title={best.title}
                            >
                              {best.title}
                            </a>
                          ) : (
                            <span className="text-neutral-600">No match</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="inline-block px-2 py-1 rounded-full text-xs font-bold"
                            style={{
                              background: confidenceBg(confidence),
                              color: confidenceColor(confidence),
                            }}
                          >
                            {confidence}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {d?.verified ? (
                            <span className="text-green-400 font-semibold text-xs">✓ Yes</span>
                          ) : (
                            <span className="text-neutral-500 text-xs">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.auto_suggestion ? (
                            <span
                              className="inline-block px-2 py-1 rounded text-[10px] font-bold uppercase"
                              style={{
                                background:
                                  r.auto_suggestion.suggested_action === "approve"
                                    ? "rgba(34,197,94,0.12)"
                                    : r.auto_suggestion.suggested_action === "reject"
                                    ? "rgba(239,68,68,0.12)"
                                    : "rgba(234,179,8,0.12)",
                                color:
                                  r.auto_suggestion.suggested_action === "approve"
                                    ? "#22c55e"
                                    : r.auto_suggestion.suggested_action === "reject"
                                    ? "#ef4444"
                                    : "#eab308",
                              }}
                              title={r.auto_suggestion.reason}
                            >
                              {r.auto_suggestion.suggested_action}
                            </span>
                          ) : (
                            <span className="text-neutral-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {feedback ? (
                            <span
                              className={`text-xs font-bold uppercase ${
                                feedback === "approved"
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {feedback}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                onClick={() => handleApprove(idx)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition"
                                title="Approve"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => handleReject(idx)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition"
                                title="Reject"
                              >
                                ✕
                              </button>
                              <button
                                onClick={() => handleRerun(idx)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition"
                                title="Rerun"
                              >
                                ↻
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {results.length === 0 && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <p className="text-sm mt-3">Enter an artist and song to run the pipeline</p>
            <p className="text-xs text-neutral-700 mt-1">Results will appear here with match decisions</p>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-[10px] text-neutral-700 py-4 border-t border-neutral-800/50">
          FOPS Control Panel · {results.length} result{results.length !== 1 ? "s" : ""}
        </footer>
    </div>
  );
}
