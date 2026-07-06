export default function TagsPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Tags Generator</h1>
        <p className="text-sm text-gray-500 mt-1">Reserved route for future backend-backed search tag generation.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6">
        <p className="text-sm text-gray-300 leading-relaxed">
          This route now resolves correctly and is held as a stable integration surface.
          Automated tag intelligence will be added only after the enterprise API contract and validation layer are complete.
        </p>
      </div>
    </div>
  );
}