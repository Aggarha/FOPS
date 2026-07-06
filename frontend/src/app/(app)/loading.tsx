export default function AppLoading() {
  return (
    <div className="flex items-center justify-center h-full min-h-[40vh]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gray-700 border-t-green-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading workspace...</p>
      </div>
    </div>
  );
}