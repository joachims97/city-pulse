import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/services/geocoder'
import { getCityOrNull } from '@/config/cities'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    const cityKey = typeof body.cityKey === 'string' ? body.cityKey.trim() : 'chicago'

    if (!address) {
      return NextResponse.json({ error: 'ZIP code is required' }, { status: 400 })
    }

    const city = getCityOrNull(cityKey)
    if (!city) {
      return NextResponse.json({ error: 'Unknown city' }, { status: 400 })
    }

    const result = await geocodeAddress(address, cityKey)

    if (!result) {
      const zipOnly = /^\d{5}$/.test(address)
      return NextResponse.json(
        {
          error: zipOnly
            ? `Enter a valid ZIP code for ${city.displayName}.`
            : `Could not find an address in ${city.displayName}. Try including a street number and name.`,
        },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[API /geocode]', err)
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 })
  }
}
