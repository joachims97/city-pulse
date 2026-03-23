import { getAllCities, getCityOrNull } from '@/config/cities'
import {
  backfillAgendaFullTextCache,
  backfillAgendaSummaryCache,
} from '@/services/agendaService'

const DEFAULT_DAYS = 7
const DEFAULT_LIMIT = 25

export interface AgendaCronRunResult {
  days: number
  limit: number
  fullTextResults: Array<Awaited<ReturnType<typeof backfillAgendaFullTextCache>> & { error?: string }>
  summaryResults: Array<Awaited<ReturnType<typeof backfillAgendaSummaryCache>> & { error?: string }>
  totals: {
    hydrated: number
    withFullText: number
    fullTextFailed: number
    summarized: number
    summaryFailed: number
  }
}

export async function runAgendaBackfill(options: {
  cityKey?: string | null
  days?: number | null
  limit?: number | null
}): Promise<AgendaCronRunResult> {
  const days = normalizePositiveInt(options.days, DEFAULT_DAYS)
  const limit = normalizePositiveInt(options.limit, DEFAULT_LIMIT)
  const cityKey = options.cityKey?.trim() ?? null

  const cities = cityKey
    ? [getCityOrNull(cityKey)].filter(Boolean)
    : getAllCities()

  if (cityKey && cities.length === 0) {
    throw new Error('Unknown city')
  }

  const fullTextResults: AgendaCronRunResult['fullTextResults'] = []
  const summaryResults: AgendaCronRunResult['summaryResults'] = []

  for (const city of cities) {
    try {
      fullTextResults.push(await backfillAgendaFullTextCache(city!, days, limit))
    } catch (err) {
      fullTextResults.push({
        cityKey: city!.key,
        fetchedItems: 0,
        queuedItems: 0,
        hydrated: 0,
        skipped: 0,
        failed: 0,
        withFullText: 0,
        error: errorMessage(err),
      })
      continue
    }

    if (city!.key === 'chicago') {
      continue
    }

    try {
      summaryResults.push(await backfillAgendaSummaryCache(city!, days, limit))
    } catch (err) {
      summaryResults.push({
        cityKey: city!.key,
        fetchedItems: 0,
        queuedItems: 0,
        summarized: 0,
        skipped: 0,
        failed: 0,
        error: errorMessage(err),
      })
    }
  }

  return {
    days,
    limit,
    fullTextResults,
    summaryResults,
    totals: {
      hydrated: fullTextResults.reduce((sum, item) => sum + item.hydrated, 0),
      withFullText: fullTextResults.reduce((sum, item) => sum + item.withFullText, 0),
      fullTextFailed: fullTextResults.reduce((sum, item) => sum + item.failed, 0),
      summarized: summaryResults.reduce((sum, item) => sum + item.summarized, 0),
      summaryFailed: summaryResults.reduce((sum, item) => sum + item.failed, 0),
    },
  }
}

export function normalizePositiveInt(value: number | string | null | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}
