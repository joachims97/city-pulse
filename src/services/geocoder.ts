/**
 * City-aware geocoder.
 * Chicago: dedicated ArcGIS address point service.
 * Charlotte/Raleigh: configurable ArcGIS geocoder service.
 * Others: Nominatim plus district polygon lookup.
 */
import { getCityOrNull, getCity } from '@/config/cities'
import { isCityZipCode } from '@/config/zipSuggestions'
import type { CityConfig } from '@/types/city'
import type { GeocodeResult } from '@/types/geo'
import { getCityDistricts, pointInDistrict } from './districtGeometry'

interface ArcGISCandidate {
  address: string
  location: { x: number; y: number }
  score: number
  attributes: {
    Ward?: string | number
    WARD?: string | number
    Community?: string
    COMMUNITY?: string
    [key: string]: unknown
  }
}

interface ArcGISResponse {
  candidates?: ArcGISCandidate[]
  features?: Array<{
    attributes: Record<string, unknown>
    geometry: { x: number; y: number }
  }>
}

export async function geocodeAddress(
  address: string,
  cityKey = 'chicago'
): Promise<GeocodeResult | null> {
  const city = getCityOrNull(cityKey) ?? getCity('chicago')
  const trimmedAddress = address.trim()

  if (/^\d{5}$/.test(trimmedAddress)) {
    if (!isCityZipCode(city.key, trimmedAddress)) {
      return null
    }

    return geocodeNominatim(trimmedAddress, city)
  }

  if (city.geocoder === 'chicago-arcgis') {
    try {
      const result = await geocodeChicagoArcGIS(trimmedAddress)
      if (result) return result
    } catch (err) {
      console.warn('[Geocoder] Chicago ArcGIS failed:', err)
    }
    return null
  }

  if (city.geocoder === 'arcgis') {
    try {
      const result = await geocodeArcGIS(trimmedAddress, city)
      if (result) return result
    } catch (err) {
      console.warn('[Geocoder] ArcGIS failed:', err)
    }
    return null
  }

  // Nominatim path (NYC, SF, LA, Philly, etc.)
  return geocodeNominatim(trimmedAddress, city)
}

// ---------------------------------------------------------------------------
// Chicago ArcGIS geocoder
// ---------------------------------------------------------------------------

async function wardFromCoordinates(lat: number, lng: number): Promise<{ ward: number; community: string } | null> {
  try {
    const url = new URL('https://data.cityofchicago.org/resource/p293-wvbd.json')
    url.searchParams.set('$where', `intersects(the_geom,'POINT(${lng} ${lat})')`)
    url.searchParams.set('$select', 'ward')
    url.searchParams.set('$limit', '1')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null

    const data = await res.json() as Array<{ ward?: string }>
    if (data.length > 0 && data[0].ward) {
      const ward = parseInt(data[0].ward, 10)
      if (ward > 0 && ward <= 50) return { ward, community: '' }
    }
  } catch {
    // ignore
  }
  return null
}

async function geocodeChicagoArcGIS(address: string): Promise<GeocodeResult | null> {
  const url = new URL(
    'https://gisapps.cityofchicago.org/arcgis/rest/services/ExternalApps/PublicAddressPoint/MapServer/0/query'
  )
  url.searchParams.set('where', `ADDRDELIV LIKE '${address.toUpperCase().replace(/'/g, "''")}%'`)
  url.searchParams.set('outFields', 'ADDRDELIV,WARD,COMMUNITY_A,OBJECTID')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('f', 'json')
  url.searchParams.set('resultRecordCount', '1')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null

  const data = (await res.json()) as ArcGISResponse

  if (data.features && data.features.length > 0) {
    const feature = data.features[0]
    const attrs = feature.attributes
    let ward = parseInt(String(attrs.WARD ?? attrs.Ward ?? '0'), 10)
    let community = String(attrs.COMMUNITY_A ?? attrs.Community ?? '')

    const lat = feature.geometry.y
    const lng = feature.geometry.x

    if (!ward || ward < 1 || ward > 50) {
      const wardInfo = await wardFromCoordinates(lat, lng)
      if (wardInfo) {
        ward = wardInfo.ward
        community = wardInfo.community
      }
    }

    if (ward && ward > 0 && ward <= 50) {
      return {
        ward,
        community,
        lat,
        lng,
        formattedAddress: String(attrs.ADDRDELIV ?? address),
      }
    }
  }

  // Fallback to geocode candidates
  const url2 = new URL(
    'https://gisapps.cityofchicago.org/arcgis/rest/services/Chicago_Addresses/GeocodeServer/findAddressCandidates'
  )
  url2.searchParams.set('singleLine', `${address}, Chicago, IL`)
  url2.searchParams.set('outFields', '*')
  url2.searchParams.set('outSR', '4326')
  url2.searchParams.set('f', 'json')
  url2.searchParams.set('maxLocations', '1')

  const res2 = await fetch(url2.toString(), { signal: AbortSignal.timeout(5000) })
  if (!res2.ok) return null

  const data2 = (await res2.json()) as ArcGISResponse

  if (data2.candidates && data2.candidates.length > 0) {
    const top = data2.candidates[0]
    if (top.score < 70) return null

    const lat = top.location.y
    const lng = top.location.x
    let ward = parseInt(String(top.attributes.Ward ?? top.attributes.WARD ?? '0'), 10)
    let community = String(top.attributes.Community ?? top.attributes.COMMUNITY ?? '')

    if (!ward || ward < 1 || ward > 50) {
      const wardInfo = await wardFromCoordinates(lat, lng)
      if (wardInfo) {
        ward = wardInfo.ward
        community = wardInfo.community
      }
    }

    if (ward && ward > 0 && ward <= 50) {
      return {
        ward,
        community,
        lat,
        lng,
        formattedAddress: top.address,
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Nominatim geocoder + Socrata spatial district lookup
// ---------------------------------------------------------------------------

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  boundingbox?: string[]
  address?: {
    postcode?: string
    [key: string]: string | undefined
  }
}

async function geocodeNominatim(
  address: string,
  city: CityConfig
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: `${address}, ${city.displayName}, ${city.state}`,
    format: 'json',
    limit: '1',
    addressdetails: '1',
  })

  if (city.geocoderConfig?.countrycodes) {
    params.set('countrycodes', city.geocoderConfig.countrycodes)
  }
  if (city.geocoderConfig?.viewbox) {
    params.set('viewbox', city.geocoderConfig.viewbox)
    params.set('bounded', '1')
  }

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CityPulse/1.0 (citypulse.app)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const results = await res.json() as NominatimResult[]
    if (!results.length) return null

    const top = results[0]
    const lat = parseFloat(top.lat)
    const lng = parseFloat(top.lon)

    // Spatial lookup in the ward/district boundaries dataset
    const district = await districtFromCoordinates(lat, lng, city)
    if (!district) return null

    return {
      ward: district,
      community: '',
      lat,
      lng,
      formattedAddress: top.display_name,
    }
  } catch (err) {
    console.warn('[Geocoder] Nominatim failed:', err)
    return null
  }
}


async function geocodeArcGIS(address: string, city: CityConfig): Promise<GeocodeResult | null> {
  if (!city.geocoderSource) return null

  const url = new URL('findAddressCandidates', ensureTrailingSlash(city.geocoderSource.url))
  const citySuffix = city.geocoderSource.citySuffix ? `, ${city.geocoderSource.citySuffix}` : `, ${city.displayName}, ${city.state}`

  url.searchParams.set('singleLine', `${address}${citySuffix}`)
  url.searchParams.set('outFields', '*')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('f', 'json')
  url.searchParams.set('maxLocations', String(city.geocoderSource.maxLocations ?? 1))

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null

  const data = (await res.json()) as ArcGISResponse
  const candidate = data.candidates?.find((item) => item.score >= (city.geocoderSource?.minScore ?? 80))
  if (!candidate) return null

  const lat = candidate.location.y
  const lng = candidate.location.x
  const district = await districtFromCoordinates(lat, lng, city)
  if (!district) return null

  return {
    ward: district,
    community: '',
    lat,
    lng,
    formattedAddress: candidate.address,
  }
}

async function districtFromCoordinates(
  lat: number,
  lng: number,
  city: CityConfig
): Promise<number | null> {
  try {
    const districts = await getCityDistricts(city)
    const match = districts.find((district) => pointInDistrict(lat, lng, district.geometry))
    if (match) return match.districtId
  } catch {
    // fall through
  }

  return null
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
