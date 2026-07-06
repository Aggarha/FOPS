'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import FingerprintLibraryStats from './components/FingerprintLibraryStats';
import ArtistsList from './components/ArtistsList';
import TracksList from './components/TracksList';
import BuildReferenceForm from './components/BuildReferenceForm';
import BatchImportForm from './components/BatchImportForm';
import JobsMonitor from './components/JobsMonitor';

export default function FingerprintLibraryPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'artists' | 'tracks' | 'build' | 'batch' | 'jobs'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/fingerprint-library/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data.stats);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Fingerprint Library</h1>
        <p className="text-gray-600 mt-2">Manage your reference fingerprint database</p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
        <TabButton 
          active={activeTab === 'overview'} 
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </TabButton>
        <TabButton 
          active={activeTab === 'artists'} 
          onClick={() => setActiveTab('artists')}
        >
          Artists
        </TabButton>
        <TabButton 
          active={activeTab === 'tracks'} 
          onClick={() => setActiveTab('tracks')}
        >
          Tracks
        </TabButton>
        <TabButton 
          active={activeTab === 'build'} 
          onClick={() => setActiveTab('build')}
        >
          Build Reference
        </TabButton>
        <TabButton 
          active={activeTab === 'batch'} 
          onClick={() => setActiveTab('batch')}
        >
          Batch Import
        </TabButton>
        <TabButton 
          active={activeTab === 'jobs'} 
          onClick={() => setActiveTab('jobs')}
        >
          Jobs
        </TabButton>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading statistics...</div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                Error: {error}
              </div>
            ) : stats ? (
              <FingerprintLibraryStats stats={stats} onRefresh={fetchStats} />
            ) : null}
          </div>
        )}

        {activeTab === 'artists' && <ArtistsList />}
        {activeTab === 'tracks' && <TracksList />}
        {activeTab === 'build' && <BuildReferenceForm onSuccess={fetchStats} />}
        {activeTab === 'batch' && <BatchImportForm onSuccess={fetchStats} />}
        {activeTab === 'jobs' && <JobsMonitor />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors ${
        active
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}
