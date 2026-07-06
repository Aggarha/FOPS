'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Stats {
  artists: number;
  albums: number;
  tracks: number;
  versions: number;
  reference_audio: number;
  fingerprints: number;
  segments: number;
  timestamp?: string;
}

export default function FingerprintLibraryStats({ stats, onRefresh }: { stats: Stats; onRefresh: () => void }) {
  const statItems = [
    { label: 'Artists', value: stats.artists, color: 'bg-blue-50' },
    { label: 'Albums', value: stats.albums, color: 'bg-green-50' },
    { label: 'Tracks', value: stats.tracks, color: 'bg-purple-50' },
    { label: 'Versions', value: stats.versions, color: 'bg-orange-50' },
    { label: 'Reference Audio', value: stats.reference_audio, color: 'bg-red-50' },
    { label: 'Fingerprints', value: stats.fingerprints, color: 'bg-indigo-50' },
    { label: 'Segments', value: stats.segments, color: 'bg-pink-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Library Statistics</h2>
        <Button onClick={onRefresh} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((item) => (
          <Card key={item.label} className={item.color}>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">{item.label}</p>
                <p className="text-3xl font-bold text-gray-900">{item.value.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.timestamp && (
        <div className="text-sm text-gray-500 text-right">
          Last updated: {new Date(stats.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}
