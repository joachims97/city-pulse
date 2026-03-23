export const DEFAULT_CITY = 'chicago'

export const CACHE_TTL = {
  complaints311: 60 * 60 * 24,        // 24 hours
  permits: 60 * 60 * 24,              // 24 hours
  violations: 60 * 60 * 24,           // 24 hours
  budget: 60 * 60 * 24 * 365,         // 1 year (updated once per budget cycle)
  agenda: 60 * 60 * 24,               // 24 hours
  inspections: 60 * 60 * 24 * 7,      // 7 days
  representative: 60 * 60 * 24 * 30,  // 30 days (council members change infrequently)
  geocode: 60 * 60,                   // 1 hour
} as const
