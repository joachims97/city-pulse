import { NextRequest, NextResponse } from 'next/server'
import { getAgendaItems } from '@/services/agendaService'
import { getCity } from '@/config/cities'

export async function GET(req: NextRequest) {
  const cityKey = req.nextUrl.searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)

  try {
    const data = await getAgendaItems(city)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API /agenda]', err)
    return NextResponse.json({ error: 'Failed to load agenda' }, { status: 500 })
  }
}
