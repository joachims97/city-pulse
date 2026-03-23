import { NextRequest, NextResponse } from 'next/server'
import { getAllCities, getCityOrNull } from '@/config/cities'
import {
  backfillAgendaFullTextCache,
  backfillAgendaSummaryCache,
} from '@/services/agendaService'

const DEFAULT_DAYS = 7
const DEFAULT_LIMIT = 100

export async function GET(req: NextRequest) {
  const expectedToken = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')

  if (!expectedToken) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const days = parsePositiveInt(req.nextUrl.searchParams.get('days'), DEFAULT_DAYS) ?? DEFAULT_DAYS
    const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit'), DEFAULT_LIMIT) ?? DEFAULT_LIMIT
    const cityKey = req.nextUrl.searchParams.get('city')

    const fullTextCities = cityKey
      ? [getCityOrNull(cityKey)].filter(Boolean)
      : getAllCities()

    if (cityKey && fullTextCities.length === 0) {
      return NextResponse.json({ error: 'Unknown city' }, { status: 400 })
    }

    const fullTextResults = []
    const summaryResults = []

    for (const city of fullTextCities) {
      fullTextResults.push(await backfillAgendaFullTextCache(city!, days, limit))

      if (city!.key !== 'chicago') {
        summaryResults.push(await backfillAgendaSummaryCache(city!, days, limit))
      }
    }

    return NextResponse.json({
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
    })
  } catch (err) {
    console.error('[API /cron/agenda-backfill]', err)
    return NextResponse.json({ error: 'Agenda cron backfill failed' }, { status: 500 })
  }
}

function parsePositiveInt(value: string | null, fallback: number | undefined): number | undefined {
  const parsed = parseInt(String(value ?? ''), 10)
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}
