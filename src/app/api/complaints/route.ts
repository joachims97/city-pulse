import { NextRequest, NextResponse } from 'next/server'
import { getComplaints } from '@/services/complaintsService'
import { getCity } from '@/config/cities'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const wardId = parseInt(searchParams.get('ward') ?? '', 10)
  const cityKey = searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)
  const defaultDays = city.key === 'la' ? 365 : 90
  const days = parseInt(searchParams.get('days') ?? String(defaultDays), 10)
  const view = searchParams.get('view') === 'full' ? 'full' : 'preview'

  if (isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    return NextResponse.json({ error: 'Invalid ward' }, { status: 400 })
  }

  try {
    const data = await getComplaints(wardId, city, days, view)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API /complaints]', err)
    return NextResponse.json({ error: 'Failed to load complaints' }, { status: 500 })
  }
}
