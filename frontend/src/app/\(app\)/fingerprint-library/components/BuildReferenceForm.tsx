'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface BuildReferenceFormProps {
  onSuccess: () => void;
}

export default function BuildReferenceForm({ onSuccess }: BuildReferenceFormProps) {
  const [formData, setFormData] = useState({
    artist: '',
    song: '',
    isrc: '',
    upc: '',
    official_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jobUid, setJobUid] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.artist || !formData.song || !formData.official_url) {
        throw new Error('Artist, Song, and Official URL are required');
      }

      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/fingerprint-library/build', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to build reference');
      }

      const data = await response.json();
      setJobUid(data.job_uid);
      setSuccess(`Reference build job created! Job UID: ${data.job_uid}`);
      setFormData({ artist: '', song: '', isrc: '', upc: '', official_url: '' });
      
      // Refresh stats after a delay
      setTimeout(onSuccess, 2000);
    } catch (err) {
      console.error('Error building reference:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Build Reference</h2>

      <Card>
        <CardHeader>
          <CardTitle>Add Single Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Artist Name *
                </label>
                <input
                  type="text"
                  name="artist"
                  value={formData.artist}
                  onChange={handleChange}
                  placeholder="e.g., Taylor Swift"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Song Title *
                </label>
                <input
                  type="text"
                  name="song"
                  value={formData.song}
                  onChange={handleChange}
                  placeholder="e.g., Anti-Hero"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ISRC (optional)
                </label>
                <input
                  type="text"
                  name="isrc"
                  value={formData.isrc}
                  onChange={handleChange}
                  placeholder="e.g., USIR20205286"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  UPC (optional)
                </label>
                <input
                  type="text"
                  name="upc"
                  value={formData.upc}
                  onChange={handleChange}
                  placeholder="e.g., 602438923857"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Official URL *
              </label>
              <input
                type="url"
                name="official_url"
                value={formData.official_url}
                onChange={handleChange}
                placeholder="e.g., https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Use official artist/label source (YouTube, Spotify, etc.)
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {success}
                {jobUid && (
                  <p className="text-sm mt-2">
                    <a 
                      href={`/protection/jobs/${jobUid}`}
                      className="underline hover:text-green-800"
                    >
                      View job progress →
                    </a>
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? 'Building...' : 'Build Reference'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
