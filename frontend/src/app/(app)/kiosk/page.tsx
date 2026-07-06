"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Settings } from "lucide-react";
import { authenticatedFetch } from '@/lib/api';

interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  created_at: string;
}

interface SystemStats {
  uptime: number;
  memory_usage: number;
  active_jobs: number;
  completed_jobs: number;
  last_update: string;
}

export default function KioskPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    uptime: 0,
    memory_usage: 45,
    active_jobs: 0,
    completed_jobs: 0,
    last_update: new Date().toLocaleTimeString(),
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setFullscreen(true);
        }
      } catch (error) {
        console.log("Fullscreen request denied");
      }
    };

    const timeout = setTimeout(enterFullscreen, 2000);
    return () => clearTimeout(timeout);
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await authenticatedFetch('/api/jobs');

      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);

        const active = (data.jobs || []).filter(
          (j: Job) => j.status === "running" || j.status === "pending"
        ).length;
        const completed = (data.jobs || []).filter(
          (j: Job) => j.status === "completed"
        ).length;

        setStats((prev) => ({
          ...prev,
          active_jobs: active,
          completed_jobs: completed,
          last_update: new Date().toLocaleTimeString(),
        }));
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

  useEffect(() => {
    fetchJobs();

    if (!autoRefresh) return;

    const interval = setInterval(fetchJobs, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-900/50 border-green-700";
      case "running":
        return "bg-blue-900/50 border-blue-700";
      case "pending":
        return "bg-yellow-900/50 border-yellow-700";
      case "failed":
        return "bg-red-900/50 border-red-700";
      default:
        return "bg-gray-900/50 border-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "running":
        return "◌";
      case "pending":
        return "⧖";
      case "failed":
        return "✕";
      default:
        return "?";
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-green-900/30">
        <h1 className="text-4xl font-bold text-green-400">FOPS KIOSK</h1>
        <button
          onClick={() => {
            if (!fullscreen) {
              document.documentElement
                .requestFullscreen()
                .then(() => setFullscreen(true))
                .catch(() => {});
            }
          }}
          className="p-2 hover:bg-gray-800 rounded transition-colors"
          title="Fullscreen"
        >
          <Settings size={24} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/50 border border-green-900/30 rounded p-4">
          <p className="text-gray-400 text-sm">UPTIME</p>
          <p className="text-3xl font-bold text-green-400 mt-2">
            {Math.floor(stats.uptime / 3600)}h
          </p>
        </div>

        <div className="bg-gray-900/50 border border-green-900/30 rounded p-4">
          <p className="text-gray-400 text-sm">ACTIVE JOBS</p>
          <p className="text-3xl font-bold text-blue-400 mt-2">
            {stats.active_jobs}
          </p>
        </div>

        <div className="bg-gray-900/50 border border-green-900/30 rounded p-4">
          <p className="text-gray-400 text-sm">COMPLETED</p>
          <p className="text-3xl font-bold text-green-400 mt-2">
            {stats.completed_jobs}
          </p>
        </div>

        <div className="bg-gray-900/50 border border-green-900/30 rounded p-4">
          <p className="text-gray-400 text-sm">LAST UPDATE</p>
          <p className="text-lg font-mono text-gray-300 mt-2">
            {stats.last_update}
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-green-400 mb-4">JOBS</h2>

        {jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-xl">No active jobs</p>
            <p className="text-sm mt-2">
              Auto-refresh: {autoRefresh ? "ON" : "OFF"} ({Math.floor(refreshInterval / 1000)}s)
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={"border-l-4 rounded p-4 " + getStatusColor(job.status)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{getStatusIcon(job.status)}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{job.type.toUpperCase()}</p>
                    <p className="text-xs text-gray-400">{job.id.slice(0, 12)}</p>
                  </div>
                </div>

                <div className="bg-black/30 rounded h-2 overflow-hidden mb-2">
                  <div
                    className="bg-green-400 h-full transition-all"
                    style={{ width: job.progress + "%" }}
                  ></div>
                </div>

                <p className="text-xs text-gray-300">{job.progress}% complete</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-4 right-4 space-y-2">
        <button
          onClick={fetchJobs}
          className="p-3 bg-green-900/50 border border-green-700 rounded hover:bg-green-900 transition-colors"
          title="Refresh now"
        >
          <RotateCcw size={20} />
        </button>

        <div className="bg-gray-900 border border-gray-700 rounded p-3 w-48">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>

          <label className="text-xs text-gray-400">
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded p-1 text-white text-xs mt-1"
            >
              <option value={5000}>Every 5 seconds</option>
              <option value={10000}>Every 10 seconds</option>
              <option value={30000}>Every 30 seconds</option>
              <option value={60000}>Every minute</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
