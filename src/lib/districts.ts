import type { CityConfig } from '@/types/city'

export function getDistrictLabel(city: CityConfig, districtId: number): string {
  return city.districtLabels?.[districtId] ?? String(districtId)
}

export function getDistrictDisplayName(city: CityConfig, districtId: number): string {
  return `${city.districtName} ${getDistrictLabel(city, districtId)}`
}

export function parseDistrictId(
  city: CityConfig,
  value: unknown
): number | null {
  if (value === null || value === undefined) return null

  const text = String(value).trim()
  if (!text) return null

  const numeric = text.match(/^\d+(?:\.0+)?$/)
  if (numeric) {
    const parsed = Number.parseInt(text, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  const normalized = text.replace(new RegExp(`^${escapeRegExp(city.districtName)}\\s+`, 'i'), '').trim().toUpperCase()

  for (const [districtId, label] of Object.entries(city.districtLabels ?? {})) {
    if (label.trim().toUpperCase() === normalized) {
      return Number.parseInt(districtId, 10)
    }
  }

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
