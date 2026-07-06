'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface Track {
  id: number;
  uid: string;
  artist_id: number;
  album_id?: number;
  title: string;
  isrc?: string;
  upc?: string;
  duration_seconds?: number;
  created_at?: string;
}

export default function TracksList() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchTracks();
  }, [offset]);

  const fetchTracks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/fingerprint-library/tracks?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch tracks');
      const data = await response.json();
      setTracks(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching tracks:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Tracks</h2>

      {loading ? (
        <div className="text-center py-8">Loading tracks...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      ) : (
        <>
          <Card>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Title</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">ISRC</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Duration</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No tracks found
                        </td>
                      </tr>
                    ) : (
                      tracks.map((track) => (
                        <tr key={track.id} className="border-b hover:bg-gray-50 cursor-pointer">
                          <td className="px-4 py-2 text-sm">{track.title}</td>
                          <td className="px-4 py-2 text-sm font-mono text-gray-600">{track.isrc || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{formatDuration(track.duration_seconds)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {track.created_at ? new Date(track.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-600">
              Offset: {offset} | Showing {tracks.length} items
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={tracks.length < limit}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
