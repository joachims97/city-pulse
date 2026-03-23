import { NextRequest, NextResponse } from 'next/server'
import { getCityOrNull } from '@/config/cities'
import { getCityDistricts } from '@/services/districtGeometry'
import type { DistrictGeometry, DistrictMapFeature } from '@/types/geo'

export async function GET(req: NextRequest) {
  const cityKey = req.nextUrl.searchParams.get('city') ?? 'chicago'
  const districtParam = req.nextUrl.searchParams.get('district')
  const city = getCityOrNull(cityKey)

  if (!city) {
    return NextResponse.json({ error: 'Unknown city' }, { status: 400 })
  }

  try {
    const districts = await getCityDistricts(city)
    const filtered = districtParam
      ? districts.filter((district) => district.districtId === parseInt(districtParam, 10))
      : districts

    if (districtParam && filtered.length === 0) {
      return NextResponse.json({ error: 'District not found' }, { status: 404 })
    }

    return NextResponse.json(filtered.map(serializeDistrict))
  } catch (err) {
    console.error('[API /districts]', err)
    return NextResponse.json({ error: 'Failed to load district geometry' }, { status: 500 })
  }
}

function serializeDistrict(district: DistrictMapFeature) {
  return {
    ...district,
    geometry: roundGeometry(district.geometry),
  }
}

function roundGeometry(geometry: DistrictGeometry, precision = 5): DistrictGeometry {
  const round = (value: number) => Number(value.toFixed(precision))

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) =>
        ring.map(([lng, lat]) => [round(lng), round(lat)])
      ),
    }
  }

  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([lng, lat]) => [round(lng), round(lat)])
      )
    ),
  }
}
