"use client";

import { DashboardStatsComponent } from "@/components/DashboardStats";

export default function Dashboard() {
  return (
    <div className="max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Analytics Dashboard</h1>
          <p className="text-gray-400">Real-time system performance and release tracking</p>
        </div>

        {/* Dashboard Stats */}
        <DashboardStatsComponent />
    </div>
  );
}
