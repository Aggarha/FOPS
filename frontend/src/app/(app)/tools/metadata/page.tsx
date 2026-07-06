export default function MetadataPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Metadata Generator</h1>
        <p className="text-sm text-gray-500 mt-1">Infrastructure-ready route for structured metadata workflows.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-4">
        <p className="text-sm text-gray-300 leading-relaxed">
          This module is intentionally route-stable but inactive until Phase 2 backend services are wired.
          No synthetic metadata generation is exposed here.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-800 bg-black/30 p-4 text-gray-400">Status: contract-ready</div>
          <div className="rounded-lg border border-gray-800 bg-black/30 p-4 text-gray-400">Backend: not connected yet</div>
          <div className="rounded-lg border border-gray-800 bg-black/30 p-4 text-gray-400">Phase: enterprise foundation</div>
        </div>
      </div>
    </div>
  );
}