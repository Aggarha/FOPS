'use client';

import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import Link from 'next/link';
import NotificationsBell from './NotificationsBell';

export default function AuthHeader() {
  const { user, permissions, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!user) return null;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-600';
      case 'analyst':
        return 'bg-blue-600';
      case 'operator':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
      <div className="flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-green-400">FOPS</span>
        </Link>

        <div className="flex items-center gap-4 relative">
          {/* Notifications Bell */}
          <NotificationsBell />

          {/* User Info Button */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-800 transition"
          >
            {/* Role Badge */}
            <span className={`${getRoleBadgeColor(user.role)} text-white px-2 py-1 rounded text-xs font-bold`}>
              {user.role.toUpperCase()}
            </span>

            {/* User Email */}
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-white">{user.full_name || user.email}</div>
              <div className="text-xs text-gray-400">{user.email}</div>
            </div>

            {/* Dropdown Arrow */}
            <svg
              className={`w-4 h-4 text-gray-400 transition ${showDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded shadow-lg z-50">
              {/* Permissions Info */}
              <div className="px-4 py-3 border-b border-gray-700">
                <div className="text-xs font-semibold text-gray-400 mb-2">PERMISSIONS:</div>
                <div className="space-y-1 text-xs text-gray-300">
                  {permissions?.can_approve && <div>✓ Can Approve</div>}
                  {permissions?.can_reject && <div>✓ Can Reject</div>}
                  {permissions?.can_run_tools && <div>✓ Can Run Tools</div>}
                  {permissions?.can_manage_users && <div>✓ Can Manage Users</div>}
                </div>
                {permissions?.allowed_tools && permissions.allowed_tools.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-gray-400 mb-1">ALLOWED TOOLS:</div>
                    <div className="text-xs text-gray-300 space-y-1">
                      {permissions.allowed_tools.map((tool) => (
                        <div key={tool}>• {tool}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={() => {
                  logout();
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-2 text-left text-red-400 hover:bg-gray-700 transition text-sm"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
