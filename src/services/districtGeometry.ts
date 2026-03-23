import type { CityConfig } from '@/types/city'
import { arcgisQueryGeoJSON } from '@/lib/arcgis'
import { getDistrictLabel, parseDistrictId } from '@/lib/districts'
import { isArcGISLayerSource } from '@/types/city'
import type { DistrictBounds, DistrictGeometry, DistrictMapFeature } from '@/types/geo'

const geometryCache = new Map<string, DistrictGeometry>()
const cityGeometryCache = new Map<string, DistrictMapFeature[]>()

export async function getCityDistricts(city: CityConfig): Promise<DistrictMapFeature[]> {
  if (cityGeometryCache.has(city.key)) return cityGeometryCache.get(city.key)!

  const districts = await fetchCityDistricts(city)
  cityGeometryCache.set(city.key, districts)

  for (const district of districts) {
    geometryCache.set(`${city.key}:${district.districtId}`, district.geometry)
  }

  return districts
}

export async function getDistrictGeometry(
  districtId: number,
  city: CityConfig
): Promise<DistrictGeometry | null> {
  const cacheKey = `${city.key}:${districtId}`
  if (geometryCache.has(cacheKey)) return geometryCache.get(cacheKey)!

  const geometry = await fetchDistrictGeometry(districtId, city)
  if (geometry) geometryCache.set(cacheKey, geometry)
  return geometry
}

export async function getDistrictBbox(
  districtId: number,
  city: CityConfig
): Promise<DistrictBounds | null> {
  const geometry = await getDistrictGeometry(districtId, city)
  return geometry ? computeBbox(geometry) : null
}

export function pointInDistrict(lat: number, lng: number, geometry: DistrictGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(geometry.coordinates, lat, lng)
  }

  return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, lat, lng))
}

async function fetchDistrictGeometry(
  districtId: number,
  city: CityConfig
): Promise<DistrictGeometry | null> {
  const cachedCityDistricts = cityGeometryCache.get(city.key)
  if (cachedCityDistricts) {
    return cachedCityDistricts.find((district) => district.districtId === districtId)?.geometry ?? null
  }

  if (city.key === 'philadelphia') {
    return fetchPhiladelphiaDistrictGeometry(districtId)
  }

  const districts = await getCityDistricts(city)
  return districts.find((district) => district.districtId === districtId)?.geometry ?? null
}

async function fetchCityDistricts(city: CityConfig): Promise<DistrictMapFeature[]> {
  if (city.key === 'philadelphia') {
    return fetchPhiladelphiaDistricts()
  }

  const source = city.datasets.wardBoundaries
  if (!source) return []

  if (isArcGISLayerSource(source)) {
    return fetchArcGISDistricts(city, source)
  }

  const districtCol = city.fields.boundaryDistrict ?? city.fields.districtCol ?? 'ward'
  const geometryCol = city.fields.boundaryGeometry ?? 'the_geom'
  const host = city.datasets.wardBoundariesHost ?? city.socrataHost
  const url = new URL(`${host}/resource/${source}.json`)
  url.searchParams.set('$select', `${districtCol},${geometryCol}`)
  url.searchParams.set('$limit', String(Math.max(city.districtCount + 10, 100)))
  url.searchParams.set('$order', `${districtCol} ASC`)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return []

  const rows = await res.json() as Array<Record<string, unknown>>
  return normalizeDistrictRows(city, rows, districtCol, geometryCol)
}

async function fetchArcGISDistricts(
  city: CityConfig,
  source: import('@/types/city').ArcGISLayerSource
): Promise<DistrictMapFeature[]> {
  const districtCol = city.fields.boundaryDistrict ?? city.fields.districtCol ?? 'ward'
  const features = await arcgisQueryGeoJSON<Record<string, unknown>>(source, {
    where: source.where ?? '1=1',
    outFields: [districtCol],
    orderByFields: `${districtCol} ASC`,
    outSR: 4326,
  })

  return features
    .map((feature) => {
      const geometry = feature.geometry
      const districtId = parseDistrictId(city, feature.properties?.[districtCol])
      if (!geometry || districtId === null) return null

      const bbox = computeBbox(geometry)
      return {
        districtId,
        label: getDistrictLabel(city, districtId),
        geometry,
        bbox,
        center: computeDistrictCenter(geometry, bbox),
      } satisfies DistrictMapFeature
    })
    .filter((district): district is DistrictMapFeature => district !== null)
    .sort((a, b) => a.districtId - b.districtId)
}

async function fetchPhiladelphiaDistrictGeometry(districtId: number): Promise<DistrictGeometry | null> {
  const url = new URL(
    'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Council_Districts_2024/FeatureServer/0/query'
  )
  url.searchParams.set('where', `district_num=${districtId}`)
  url.searchParams.set('outFields', 'district,district_num')
  url.searchParams.set('f', 'geojson')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null

  const data = await res.json() as { features?: Array<{ geometry?: DistrictGeometry }> }
  return data.features?.[0]?.geometry ?? null
}

async function fetchPhiladelphiaDistricts(): Promise<DistrictMapFeature[]> {
  const url = new URL(
    'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Council_Districts_2024/FeatureServer/0/query'
  )
  url.searchParams.set('where', '1=1')
  url.searchParams.set('outFields', 'district_num')
  url.searchParams.set('f', 'geojson')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return []

  const data = await res.json() as {
    features?: Array<{ geometry?: DistrictGeometry; properties?: { district_num?: number | string } }>
  }

  return (data.features ?? [])
    .map((feature) => {
      const geometry = feature.geometry
      const districtId = parseInt(String(feature.properties?.district_num ?? ''), 10)
      if (!geometry || Number.isNaN(districtId)) return null

      const bbox = computeBbox(geometry)
      return {
        districtId,
        label: String(districtId),
        geometry,
        bbox,
        center: computeDistrictCenter(geometry, bbox),
      } satisfies DistrictMapFeature
    })
    .filter((district): district is DistrictMapFeature => district !== null)
    .sort((a, b) => a.districtId - b.districtId)
}

function normalizeDistrictRows(
  city: CityConfig,
  rows: Array<Record<string, unknown>>,
  districtCol: string,
  geometryCol: string
): DistrictMapFeature[] {
  const districts: DistrictMapFeature[] = []
  const seen = new Set<number>()

  for (const row of rows) {
    const districtId = parseDistrictId(city, row[districtCol])
    const geometry = row[geometryCol] as DistrictGeometry | undefined
    if (districtId === null || !geometry || seen.has(districtId)) continue

    const bbox = computeBbox(geometry)
    districts.push({
      districtId,
      label: getDistrictLabel(city, districtId),
      geometry,
      bbox,
      center: computeDistrictCenter(geometry, bbox),
    })
    seen.add(districtId)
  }

  return districts.sort((a, b) => a.districtId - b.districtId)
}

function polygonContainsPoint(polygon: number[][][], lat: number, lng: number): boolean {
  const [outerRing, ...holes] = polygon
  if (!pointInRing(outerRing, lat, lng)) return false
  return !holes.some((ring) => pointInRing(ring, lat, lng))
}

function pointInRing(ring: number[][], lat: number, lng: number): boolean {
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]

    const intersects =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi)

    if (intersects) inside = !inside
  }

  return inside
}

function computeBbox(
  geometry: DistrictGeometry
): DistrictBounds {
  const coords =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flat(2)
      : geometry.coordinates.flat()

  const lngs = coords.map(([lng]) => lng)
  const lats = coords.map(([, lat]) => lat)

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }
}

function computeDistrictCenter(
  geometry: DistrictGeometry,
  bbox: DistrictBounds
): { lat: number; lng: number } {
  const ring = getLargestOuterRing(geometry)
  const centroid = ring ? computeRingCentroid(ring) : null

  if (centroid && pointInDistrict(centroid.lat, centroid.lng, geometry)) {
    return centroid
  }

  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2,
  }
}

function getLargestOuterRing(geometry: DistrictGeometry): number[][] | null {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0] ?? null
  }

  let largestRing: number[][] | null = null
  let largestArea = 0

  for (const polygon of geometry.coordinates) {
    const ring = polygon[0]
    if (!ring) continue
    const area = Math.abs(computeSignedRingArea(ring))
    if (area > largestArea) {
      largestArea = area
      largestRing = ring
    }
  }

  return largestRing
}

function computeRingCentroid(ring: number[][]): { lat: number; lng: number } | null {
  let crossSum = 0
  let lngSum = 0
  let latSum = 0

  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const cross = x1 * y2 - x2 * y1
    crossSum += cross
    lngSum += (x1 + x2) * cross
    latSum += (y1 + y2) * cross
  }

  if (Math.abs(crossSum) < Number.EPSILON) return null

  return {
    lng: lngSum / (3 * crossSum),
    lat: latSum / (3 * crossSum),
  }
}

function computeSignedRingArea(ring: number[][]): number {
  let area = 0

  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    area += x1 * y2 - x2 * y1
  }

  return area / 2
}
