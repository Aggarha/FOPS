'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { fetchStats, type DashboardStats } from '@/lib/api';

interface DistributionData {
  name: string;
  value: number;
  color: string;
}

export function DashboardStatsComponent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await fetchStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return <div className="text-gray-400">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="text-red-400">Failed to load statistics</div>;
  }

  const releaseTypes: DistributionData[] = [
    { name: 'Singles', value: stats.singles, color: '#00FF9C' },
    { name: 'Albums', value: stats.albums, color: '#00CC7A' },
    { name: 'EPs', value: stats.eps, color: '#0099CC' },
    { name: 'Concerts', value: stats.concerts, color: '#FF6B9D' },
    { name: 'Music Videos', value: stats.mv, color: '#FFD93D' },
  ];

  const operationalBreakdown: DistributionData[] = [
    { name: 'Singles', value: stats.singles, color: '#00FF9C' },
    { name: 'Albums', value: stats.albums, color: '#00CC7A' },
    { name: 'EPs', value: stats.eps, color: '#0099CC' },
    { name: 'Concerts', value: stats.concerts, color: '#FF6B9D' },
    { name: 'Videos', value: stats.mv, color: '#FFD93D' },
    { name: 'Lyrics', value: stats.lyrics_videos, color: '#F59E0B' },
    { name: 'AI', value: stats.ai, color: '#22D3EE' },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Releases', value: stats.total, color: 'from-green-600 to-green-900' },
          { label: 'Singles', value: stats.singles, color: 'from-blue-600 to-blue-900' },
          { label: 'Albums', value: stats.albums, color: 'from-purple-600 to-purple-900' },
          { label: 'Videos', value: stats.mv, color: 'from-pink-600 to-pink-900' },
        ].map((kpi, idx) => (
          <div
            key={idx}
            className={`bg-gradient-to-br ${kpi.color} rounded-lg p-6 border border-opacity-20 border-white`}
          >
            <p className="text-gray-300 text-sm uppercase tracking-wider">{kpi.label}</p>
            <p className="text-4xl font-bold text-white mt-2">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Breakdown Chart */}
        <div className="bg-gray-900/50 border border-green-500/30 rounded-lg p-6">
          <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">
            Operational Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={operationalBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #00FF9C' }} />
              <Bar dataKey="value" fill="#00FF9C" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-gray-900/50 border border-green-500/30 rounded-lg p-6">
          <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">
            Release Type Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={releaseTypes}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#00FF9C"
                dataKey="value"
              >
                {releaseTypes.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Integrity Notice */}
      <div className="bg-gray-900/50 border border-green-500/30 rounded-lg p-6">
        <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">
          Historical Analytics
        </h3>
        <div className="rounded-lg border border-gray-800 bg-black/30 p-6 text-sm text-gray-400 leading-relaxed">
          Historical time-series analytics were removed from this view because the current frontend had been generating randomized data.
          This dashboard now renders only backend-backed metrics until a real historical analytics endpoint is introduced.
        </div>
      </div>
    </div>
  );
}
