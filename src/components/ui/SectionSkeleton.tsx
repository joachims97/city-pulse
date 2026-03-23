export default function SectionSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel animate-pulse">
      <div className="panel-header">
        <div className="h-3 bg-gray-300 w-32" />
      </div>
      <div className="px-3 py-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-100 mb-2" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    </div>
  )
}
