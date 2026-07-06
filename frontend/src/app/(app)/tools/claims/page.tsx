export default function ClaimsPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Claims Validation</h1>
        <p className="text-sm text-gray-500 mt-1">Reserved enterprise route for future content ID claim validation workflows.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-4">
        <p className="text-sm text-gray-300 leading-relaxed">
          The navigation path is now stable. Claim adjudication logic will only be introduced when the backend claim ledger,
          audit trail, and tenant-aware policy enforcement are in place.
        </p>
      </div>
    </div>
  );
}