'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface BatchImportFormProps {
  onSuccess: () => void;
}

export default function BatchImportForm({ onSuccess }: BatchImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jobUid, setJobUid] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/fingerprint-library/build-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to start batch import');
      }

      const data = await response.json();
      setJobUid(data.job_uid);
      setSuccess(`Batch import job created! Job UID: ${data.job_uid}`);
      setFile(null);

      // Refresh stats after a delay
      setTimeout(onSuccess, 2000);
    } catch (err) {
      console.error('Error importing batch:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Batch Import</h2>

      <Card>
        <CardHeader>
          <CardTitle>Upload Excel File</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
              <p className="font-medium">File Format</p>
              <p className="text-sm mt-1">
                Upload an Excel file (.xlsx) with columns: <strong>Artist | Song | ISRC | UPC | Official URL</strong>
              </p>
              <p className="text-sm mt-2">
                At minimum, Artist, Song, and Official URL are required.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Excel File
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  required
                />
                {file && (
                  <p className="text-sm text-gray-600 mt-2">
                    Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
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
                  disabled={loading || !file}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Uploading...' : 'Start Batch Import'}
                </Button>
              </div>
            </form>

            <div className="bg-gray-50 border border-gray-200 px-4 py-3 rounded text-sm">
              <p className="font-medium mb-2">Example spreadsheet format:</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Artist</th>
                    <th className="text-left py-1">Song</th>
                    <th className="text-left py-1">ISRC</th>
                    <th className="text-left py-1">UPC</th>
                    <th className="text-left py-1">Official URL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1">Taylor Swift</td>
                    <td className="py-1">Anti-Hero</td>
                    <td className="py-1">USIR20205286</td>
                    <td className="py-1">602438923857</td>
                    <td className="py-1">https://www.youtube.com/watch?v=...</td>
                  </tr>
                  <tr>
                    <td className="py-1">The Weeknd</td>
                    <td className="py-1">Blinding Lights</td>
                    <td className="py-1">CAXL91900767</td>
                    <td className="py-1"></td>
                    <td className="py-1">https://www.youtube.com/watch?v=...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
