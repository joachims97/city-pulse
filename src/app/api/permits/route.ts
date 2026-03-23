import { NextRequest, NextResponse } from 'next/server'
import { getPermits } from '@/services/permitsService'
import { getCity } from '@/config/cities'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const wardId = parseInt(searchParams.get('ward') ?? '', 10)
  const days = parseInt(searchParams.get('days') ?? '180', 10)
  const cityKey = searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)
  const view = searchParams.get('view') === 'full' ? 'full' : 'preview'

  if (isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    return NextResponse.json({ error: 'Invalid ward' }, { status: 400 })
  }

  try {
    const data = await getPermits(wardId, city, days, view)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API /permits]', err)
    return NextResponse.json({ error: 'Failed to load permits' }, { status: 500 })
  }
}
