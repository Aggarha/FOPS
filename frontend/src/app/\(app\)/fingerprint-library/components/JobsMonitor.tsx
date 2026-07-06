'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface Job {
  job_uid: string;
  tenant_id: string;
  user_id: number;
  tool_name: string;
  status: string;
  progress: number;
  current_step?: string;
  result?: any;
  error?: any;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
}

export default function JobsMonitor() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      let url = '/api/protection/jobs?limit=100';
      if (filter !== 'all') {
        url += `&status=${filter}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'queued': 'bg-gray-100 text-gray-800',
      'running': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
      'cancelled': 'bg-yellow-100 text-yellow-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredJobs = filter === 'all' 
    ? jobs 
    : jobs.filter(job => job.status === filter);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Job Monitor</h2>

      <div className="flex gap-2">
        {(['all', 'running', 'completed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {f === 'all' ? 'All Jobs' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={fetchJobs}
          className="ml-auto px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading jobs...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No jobs found</div>
          ) : (
            filteredJobs.map((job) => (
              <Card key={job.job_uid}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{job.tool_name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(job.status)}`}>
                            {job.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 font-mono break-all">{job.job_uid}</p>
                      </div>
                      <a
                        href={`/protection/jobs/${job.job_uid}`}
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        View Details →
                      </a>
                    </div>

                    {job.current_step && (
                      <p className="text-sm text-gray-700">
                        <strong>Current:</strong> {job.current_step}
                      </p>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{job.progress.toFixed(0)}% complete</p>
                    </div>

                    {/* Timestamps */}
                    <div className="text-xs text-gray-500 flex gap-4">
                      {job.created_at && (
                        <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                      )}
                      {job.started_at && (
                        <span>Started: {new Date(job.started_at).toLocaleString()}</span>
                      )}
                      {job.completed_at && (
                        <span>Completed: {new Date(job.completed_at).toLocaleString()}</span>
                      )}
                    </div>

                    {/* Error Message */}
                    {job.error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                        <strong>Error:</strong> {JSON.stringify(job.error)}
                      </div>
                    )}

                    {/* Result */}
                    {job.result && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
                        <strong>Result:</strong> {JSON.stringify(job.result)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
