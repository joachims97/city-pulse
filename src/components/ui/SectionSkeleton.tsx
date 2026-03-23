export default function SectionSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel panel-accent-black animate-pulse">
      <div className="panel-header">
        <div className="h-3 w-40 bg-[rgba(17,17,17,0.16)]" />
      </div>
      <div className="px-5 pb-5 pt-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="mb-3 h-3 bg-[rgba(17,17,17,0.08)]"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </div>
    </div>
  )
}
