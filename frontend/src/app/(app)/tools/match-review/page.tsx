export default function MatchReviewPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Match Review</h1>
        <p className="text-sm text-gray-500 mt-1">Stable review surface for future canonical and content-match workflows.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-3 text-sm text-gray-300 leading-relaxed">
        <p>This route exists to eliminate dead navigation and provide a controlled entry point for future review queues.</p>
        <p>Phase 1 intentionally does not fabricate review data or emulate matching decisions.</p>
      </div>
    </div>
  );
}