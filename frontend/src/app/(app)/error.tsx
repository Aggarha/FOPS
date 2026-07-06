'use client';

import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('App route error', error);
  }, [error]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-1">The current workspace view failed to load safely.</p>
      </div>

      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 space-y-4">
        <p className="text-sm text-red-200 leading-relaxed">
          {error.message || 'Unexpected application error'}
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold transition"
        >
          Retry
        </button>
      </div>
    </div>
  );
}