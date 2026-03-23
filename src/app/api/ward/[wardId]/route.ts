import { NextRequest, NextResponse } from 'next/server'
import { getRepresentative } from '@/services/wardService'
import { getCity } from '@/config/cities'

export async function GET(
  req: NextRequest,
  { params }: { params: { wardId: string } }
) {
  const wardId = parseInt(params.wardId, 10)
  const cityKey = req.nextUrl.searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)

  if (isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    return NextResponse.json({ error: `Invalid ${city.districtName} ID (must be 1–${city.districtCount})` }, { status: 400 })
  }

  try {
    const rep = await getRepresentative(wardId, city)
    return NextResponse.json(rep)
  } catch (err) {
    console.error('[API /ward]', err)
    return NextResponse.json({ error: 'Failed to load ward data' }, { status: 500 })
  }
}
