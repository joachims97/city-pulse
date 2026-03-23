export default function EmptyState({
  message,
  tone = 'muted',
}: {
  message: string
  tone?: 'muted' | 'error'
}) {
  return (
    <div className={`empty-state ${tone === 'error' ? 'empty-state--error' : ''}`}>
      {message}
    </div>
  )
}
