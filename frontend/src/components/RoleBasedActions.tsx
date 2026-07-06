'use client';

import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { approveDecision, rejectDecision } from '@/lib/api';

interface RoleBasedActionsProps {
  song: string;
  artist: string;
  bestMatch: string;
  confidence: number;
  onSuccess?: () => void;
}

export default function RoleBasedActions({
  song,
  artist,
  bestMatch,
  confidence,
  onSuccess,
}: RoleBasedActionsProps) {
  const { canApprove, canReject } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!canApprove() && !canReject()) {
    return (
      <div className="p-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300 text-xs">
        ⚠ You don't have permission to approve/reject decisions.
      </div>
    );
  }

  const handleApprove = async () => {
    setLoading(true);
    setError('');
    try {
      if (!canApprove()) {
        throw new Error('You do not have permission to approve decisions');
      }
      await approveDecision(song, artist, bestMatch, confidence);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError('');
    try {
      if (!canReject()) {
        throw new Error('You do not have permission to reject decisions');
      }
      await rejectDecision(song, artist);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {canApprove() && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded transition disabled:opacity-50"
          >
            {loading ? 'Approving...' : '✓ Approve'}
          </button>
        )}
        {canReject() && (
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded transition disabled:opacity-50"
          >
            {loading ? 'Rejecting...' : '✗ Reject'}
          </button>
        )}
      </div>
    </div>
  );
}
