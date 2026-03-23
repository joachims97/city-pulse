import { NextRequest, NextResponse } from 'next/server'
import { normalizePositiveInt, runAgendaBackfill } from '@/services/agendaCron'

export const maxDuration = 300

interface Props {
  params: {
    cityKey: string
  }
}

export async function GET(req: NextRequest, { params }: Props) {
  const expectedToken = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')

  if (!expectedToken) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAgendaBackfill({
      cityKey: params.cityKey,
      days: normalizePositiveInt(req.nextUrl.searchParams.get('days'), 7),
      limit: normalizePositiveInt(req.nextUrl.searchParams.get('limit'), 25),
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error(`[API /cron/agenda-backfill/${params.cityKey}]`, err)
    if (err instanceof Error && err.message === 'Unknown city') {
      return NextResponse.json({ error: 'Unknown city' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Agenda cron backfill failed' }, { status: 500 })
  }
}
