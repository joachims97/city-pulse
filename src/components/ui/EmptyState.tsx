export default function EmptyState({
  message,
  tone = 'muted',
}: {
  message: string
  tone?: 'muted' | 'error'
}) {
  return (
    <div className={`px-3 py-4 text-xs ${tone === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
      {message}
    </div>
  )
}
