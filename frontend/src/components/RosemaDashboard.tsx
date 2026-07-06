"use client";

import { useState, useEffect } from "react";

/* ─────────────────── TYPES ─────────────────── */

interface RosemaStats {
  singles: number;
  eps: number;
  albums: number;
  concerts: number;
  mvs: number;
  lyrics: number;
  ai: number;
  concerts2: number;
  totalReleases: number;
  totalTracks: number;
}

interface ReleaseItem {
  date: string;
  day: string;
  title: string;
  artist: string;
}

/* ─────────────────── STAT BUBBLE ─────────────── */

function StatBubble({ 
  label, 
  value 
}: { 
  label: string; 
  value: number 
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        className="w-28 h-28 rounded-full flex items-center justify-center font-black text-3xl"
        style={{
          background: "radial-gradient(circle at 35% 35%, #00ff66, #00ff6633)",
          boxShadow: "0 0 30px #00ff6666, 0 0 60px #00ff6633, inset 0 0 20px #00ff6611",
          border: "3px solid #00ff6644",
          color: "#00ff66",
        }}
      >
        {value}
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

/* ─────────────────── STAT GRID ITEM ─────────────── */

function StatGridItem({ 
  label, 
  value 
}: { 
  label: string; 
  value: number 
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-xl border"
        style={{
          background: "radial-gradient(circle at 35% 35%, #00ff6622, transparent)",
          boxShadow: "0 0 16px #00ff6644, inset 0 0 12px #00ff6611",
          borderColor: "#00ff6644",
          color: "#00ff66",
        }}
      >
        {value}
      </div>
      <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">
        {label}
      </span>
    </div>
  );
}

/* ─────────────────── DETAIL LABEL ─────────────── */

function DetailLabel({ 
  label, 
  value 
}: { 
  label: string; 
  value: string | number 
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">
        {label}
      </p>
      <p className="text-sm text-gray-300">{value || "—"}</p>
    </div>
  );
}

/* ─────────────────── PROCESSING BAR ─────────────── */

function ProcessingBar({ 
  label 
}: { 
  label: string 
}) {
  return (
    <div className="w-full">
      <p className="text-xs text-gray-500 uppercase tracking-widest font-medium mb-2">
        {label}
      </p>
      <div 
        className="w-full py-3 rounded text-center font-bold text-black text-sm"
        style={{ background: "#ffcc00" }}
      >
        Processing
      </div>
    </div>
  );
}

/* ─────────────────── MAIN COMPONENT ─────────────── */

export default function RosemaDashboard() {
  const [stats, setStats] = useState<RosemaStats>({
    singles: 33,
    eps: 6,
    albums: 4,
    concerts: 2,
    mvs: 29,
    lyrics: 69,
    ai: 1,
    concerts2: 31,
    totalReleases: 46,
    totalTracks: 130,
  });

  const upcomingReleases: ReleaseItem[] = [
    {
      date: "Sunday",
      day: "Apr 26",
      title: "La Tekhsamy",
      artist: "Sara Salman",
    },
    {
      date: "Wednesday",
      day: "Apr 29",
      title: "Balash Teeba Piano Version",
      artist: "Solema",
    },
    {
      date: "Wednesday",
      day: "Apr 29",
      title: "Shata",
      artist: "Sheza",
    },
  ];

  return (
    <div 
      className="w-screen h-screen overflow-hidden select-none"
      style={{ background: "#000000" }}
    >
      {/* ────── HEADER ────── */}
      <header className="h-24 flex items-center justify-between px-8 border-b border-gray-800">
        {/* Left */}
        <div className="flex items-center gap-3 w-48">
          <h1 className="text-lg font-bold text-white">Upcoming Releases</h1>
          <p className="text-lg font-bold" style={{ color: "#00ff66" }}>
            2026
          </p>
        </div>

        {/* Center - Logo */}
        <div className="flex-1 flex items-center justify-center">
          <img 
            src="/rosema-logo.svg" 
            alt="Rosema" 
            className="h-16 w-auto object-contain"
            style={{ filter: 'brightness(1.2)' }}
          />
        </div>

        {/* Right - Balanced spacing */}
        <div className="w-48"></div>
      </header>

      {/* ────── STATS SECTION ────── */}
      <section className="px-8 py-8 border-b border-gray-800">
        <div className="flex justify-between items-center gap-6">
          {/* Left stats grid */}
          <div className="flex gap-10">
            <StatGridItem label="Single" value={stats.singles} />
            <StatGridItem label="EP" value={stats.eps} />
            <StatGridItem label="Album" value={stats.albums} />
            <StatGridItem label="Concert" value={stats.concerts} />
          </div>

          {/* Center bubbles */}
          <div className="flex gap-20">
            <StatBubble 
              label="TOTAL RELEASES" 
              value={stats.totalReleases} 
            />
            <StatBubble 
              label="TOTAL TRACKS" 
              value={stats.totalTracks} 
            />
          </div>

          {/* Right stats grid */}
          <div className="flex gap-10">
            <StatGridItem label="MV" value={stats.mvs} />
            <StatGridItem label="Lyrics" value={stats.lyrics} />
            <StatGridItem label="AI" value={stats.ai} />
            <StatGridItem label="Concert" value={stats.concerts2} />
          </div>
        </div>
      </section>

      {/* ────── MAIN CONTENT ────── */}
      <section className="flex flex-1 overflow-hidden border-b border-gray-800">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col p-8 border-r border-gray-800">
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-white">
              No Releases
            </h2>
            <p className="text-lg font-medium mt-1" style={{ color: "#ffcc00" }}>
              Today
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-6 text-sm mb-8">
            <DetailLabel label="Cairo" value="—" />
            <DetailLabel label="Saudi" value="—" />
            <DetailLabel label="UPC" value="0" />
            <DetailLabel label="Video Type" value="—" />
            <DetailLabel label="Type" value="0" />
            <DetailLabel label="# of Tracks" value="—" />
            <DetailLabel label="Label" value="—" />
            <DetailLabel label="Production/Distribution" value="—" />
          </div>

          <div className="mt-auto flex flex-col gap-4">
            <ProcessingBar label="Artwork" />
            <ProcessingBar label="Motion" />
            <ProcessingBar label="YouTube" />
          </div>
        </div>

        {/* CENTER DIVIDER */}
        <div 
          className="w-px"
          style={{ background: "linear-gradient(to bottom, transparent, #00ff66, transparent)" }}
        ></div>

        {/* RIGHT COLUMN */}
        <div className="flex-1 flex flex-col p-8">
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-white">
              Artist
            </h2>
            <p className="text-lg font-medium mt-1" style={{ color: "#ffcc00" }}>
              Song
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-6 text-sm mb-8">
            <DetailLabel label="Type II" value="—" />
            <DetailLabel label="Saudi II" value="—" />
            <DetailLabel label="UPC II" value="—" />
            <DetailLabel label="Video Type II" value="—" />
            <DetailLabel label="# of Tracks II" value="—" />
            <DetailLabel label="Label II" value="—" />
            <DetailLabel label="Production/Distribution II" value="—" />
            <DetailLabel label="Motion Team Member II" value="—" />
          </div>

          <div className="mt-auto flex flex-col gap-4">
            <ProcessingBar label="Artwork" />
            <ProcessingBar label="Motion" />
            <ProcessingBar label="YouTube" />
          </div>
        </div>
      </section>

      {/* ────── BOTTOM: UPCOMING RELEASES ────── */}
      <section className="px-8 py-6 bg-black flex flex-col gap-4">
        <h3 
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: "#ffcc00" }}
        >
          NEXT
        </h3>

        <div className="flex gap-16">
          {upcomingReleases.map((release, idx) => (
            <div key={idx} className="flex-1 flex flex-col gap-1">
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                {release.date}
              </p>
              <p style={{ color: "#ffcc00" }} className="text-lg font-bold">
                {release.title}
              </p>
              <p className="text-sm text-gray-400">{release.artist}</p>
              <p className="text-xs text-gray-600">{release.day}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
