'use client';

import { LiveLogs } from '@/components/LiveLogs';

export default function LogsPage() {
  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">System Logs</h1>
        <p className="text-gray-400">Real-time activity monitoring and event streaming</p>
      </div>

      {/* Live Logs Component */}
      <LiveLogs />
    </div>
  );
}
