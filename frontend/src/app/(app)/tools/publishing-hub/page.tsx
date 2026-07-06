'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, BookOpen, Hash, FileText, Download, ArrowRight, Globe, Video, Mic2, Database, LayoutTemplate } from 'lucide-react';

const TOOLS = [
  {
    href: '/tools/publishing',
    icon: Zap,
    title: 'Publishing Suite',
    description: 'Enterprise metadata generation — titles, descriptions, tags, credits. Supports release picker, UPC lookup, and multi-channel output.',
    badges: ['Music Video', 'Lyrics Video', 'Concert'],
    accent: 'border-green-900/50 bg-green-950/10',
    iconColor: 'text-green-400',
  },
  {
    href: '/tools/publishing',
    icon: BookOpen,
    title: 'Credits Formatter',
    description: 'Parse Arabic/bilingual credits into structured publishing format with role detection and transliteration.',
    badges: ['Arabic', 'Bilingual', 'Structured'],
    accent: 'border-blue-900/50 bg-blue-950/10',
    iconColor: 'text-blue-400',
  },
  {
    href: '/tools/publishing/sources',
    icon: Database,
    title: 'Source Library',
    description: 'Register tenant metadata source files (XLSX/CSV), import records, and manage column mappings for canonical field alignment.',
    badges: ['XLSX', 'CSV', 'Multi-tenant', 'Mapping'],
    accent: 'border-emerald-900/50 bg-emerald-950/10',
    iconColor: 'text-emerald-400',
  },
  {
    href: '/tools/publishing/release-picker',
    icon: Database,
    title: 'Release Picker',
    description: 'Search across imported metadata records, preview all 20 canonical fields, and autofill the Publishing Suite in one click.',
    badges: ['Autofill', 'Search', 'Multi-tenant'],
    accent: 'border-teal-900/50 bg-teal-950/10',
    iconColor: 'text-teal-400',
  },
  {
    href: '/tools/publishing/templates',
    icon: LayoutTemplate,
    title: 'Template Library',
    description: 'Create and manage title, description, and tag templates for all release types with live variable preview.',
    badges: ['Music Video', 'Album', 'Lyrics Video', 'Concert'],
    accent: 'border-violet-900/50 bg-violet-950/10',
    iconColor: 'text-violet-400',
  },
  {
    href: '/tools/publishing/channel-templates',
    icon: Globe,
    title: 'Channel Templates',
    description: 'Manage per-channel intro text, subscribe CTAs, social link blocks, and footer text for description generation.',
    badges: ['Intro', 'Social Links', 'Footer', 'Multi-channel'],
    accent: 'border-sky-900/50 bg-sky-950/10',
    iconColor: 'text-sky-400',
  },
];

const QUICK_STATS = [
  { label: 'Templates', value: '3', icon: FileText, color: 'text-pink-400' },
  { label: 'Channels', value: '16+', icon: Globe, color: 'text-blue-400' },
  { label: 'Export Formats', value: 'TXT · DOCX · YT', icon: Download, color: 'text-yellow-400' },
  { label: 'Input Sources', value: '3', icon: Hash, color: 'text-purple-400' },
];

export default function PublishingHubPage() {
  return (
    <div className="max-w-screen-lg space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Publishing Hub</h1>
        <p className="text-sm text-gray-500 mt-1">Enterprise tools for music release publishing & metadata management</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK_STATS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-800/50 bg-gray-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
              <Icon className={`w-3.5 h-3.5 ${color} opacity-50`} />
            </div>
            <p className={`text-lg font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TOOLS.map(({ href, icon: Icon, title, description, badges, accent, iconColor }) => (
          <Link key={title} href={href}
            className={`group rounded-xl border ${accent} p-6 flex flex-col gap-4 hover:border-gray-700 transition-all`}>
            <div className="flex items-start justify-between gap-3">
              <div className={`w-10 h-10 rounded-xl border border-current/20 flex items-center justify-center ${iconColor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors mt-1" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{title}</h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span key={b} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-800 text-gray-500">{b}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {/* How to use */}
      <div className="rounded-xl border border-gray-800/50 bg-gray-950 p-6">
        <h2 className="text-sm font-bold text-white mb-4">Publishing Workflow</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { step: '01', title: 'Pick Release', desc: 'Search by artist, song, or UPC. Autofills all metadata.' },
            { step: '02', title: 'Set Template', desc: 'Choose Music Video, Lyrics Video, or Concert type.' },
            { step: '03', title: 'Select Channel', desc: 'Pick from 16+ configured YouTube channels.' },
            { step: '04', title: 'Generate & Export', desc: 'Download as TXT, DOCX, or copy YouTube format.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <span className="text-3xl font-black text-gray-800 leading-none tabular-nums">{step}</span>
              <div>
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
