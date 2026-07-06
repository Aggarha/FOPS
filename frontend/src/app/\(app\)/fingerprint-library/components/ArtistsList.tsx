'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface Artist {
  id: number;
  uid: string;
  name: string;
  normalized_name: string;
  mbid?: string;
  isni?: string;
  created_at?: string;
}

export default function ArtistsList() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchArtists();
  }, [offset]);

  const fetchArtists = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/fingerprint-library/artists?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch artists');
      const data = await response.json();
      setArtists(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching artists:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Artists</h2>

      {loading ? (
        <div className="text-center py-8">Loading artists...</div>
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
                      <th className="px-4 py-2 text-left text-sm font-semibold">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Normalized</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">MusicBrainz ID</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artists.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No artists found
                        </td>
                      </tr>
                    ) : (
                      artists.map((artist) => (
                        <tr key={artist.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm">{artist.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{artist.normalized_name}</td>
                          <td className="px-4 py-2 text-sm font-mono text-gray-600">{artist.mbid || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {artist.created_at ? new Date(artist.created_at).toLocaleDateString() : '—'}
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
              Offset: {offset} | Showing {artists.length} items
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={artists.length < limit}
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
