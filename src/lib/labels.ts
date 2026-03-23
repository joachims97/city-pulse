export function shortenCompactLabel(label: string | null | undefined, maxLength = 20) {
  const normalized = label?.replace(/\s+/g, ' ').trim()

  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized

  const words = normalized.split(' ').filter(Boolean)
  return words.slice(0, 2).join(' ')
}
