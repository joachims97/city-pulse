import { NextRequest, NextResponse } from 'next/server'
import { getInspections } from '@/services/inspectionsService'
import { getCity } from '@/config/cities'
import { getInspectionDefaultDays } from '@/lib/inspectionWindow'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const wardId = parseInt(searchParams.get('ward') ?? '', 10)
  const cityKey = searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)
  const defaultDays = getInspectionDefaultDays(city.key)
  const days = parseInt(searchParams.get('days') ?? String(defaultDays), 10)
  const view = searchParams.get('view') === 'full' ? 'full' : 'preview'

  if (isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    return NextResponse.json({ error: 'Invalid ward' }, { status: 400 })
  }

  try {
    const data = await getInspections(wardId, city, days, view)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API /inspections]', err)
    return NextResponse.json({ error: 'Failed to load inspections' }, { status: 500 })
  }
}
