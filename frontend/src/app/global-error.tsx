'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global app error', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen flex items-center justify-center px-4">
        <div className="max-w-xl w-full rounded-2xl border border-red-900/50 bg-red-950/20 p-8 space-y-4">
          <h1 className="text-3xl font-black tracking-tight">FOPS encountered a fatal error</h1>
          <p className="text-sm text-red-200 leading-relaxed">{error.message || 'Unexpected application error'}</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold transition"
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}