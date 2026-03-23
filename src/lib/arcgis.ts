import type { ArcGISLayerSource } from '@/types/city'
import type { DistrictBounds, DistrictGeometry } from '@/types/geo'

export interface ArcGISPointGeometry {
  x: number
  y: number
}

export interface ArcGISFeature<T = Record<string, unknown>> {
  attributes: T
  geometry?: ArcGISPointGeometry | Record<string, unknown> | null
}

interface ArcGISQueryResponse<T> {
  features?: ArcGISFeature<T>[]
  exceededTransferLimit?: boolean
}

interface ArcGISGeoJSONFeature<T = Record<string, unknown>> {
  type: 'Feature'
  properties?: T
  geometry?: DistrictGeometry
}

interface ArcGISGeoJSONResponse<T = Record<string, unknown>> {
  features?: ArcGISGeoJSONFeature<T>[]
}

interface ArcGISQueryOptions {
  where?: string
  outFields?: string[]
  returnGeometry?: boolean
  orderByFields?: string
  resultOffset?: number
  resultRecordCount?: number
  geometry?: string
  geometryType?: string
  spatialRel?: string
  inSR?: number
  outSR?: number
  returnDistinctValues?: boolean
}

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_PAGES = 20

export async function arcgisQuery<T = Record<string, unknown>>(
  source: ArcGISLayerSource,
  options: ArcGISQueryOptions = {}
): Promise<ArcGISFeature<T>[]> {
  const params = new URLSearchParams()
  params.set('f', 'json')
  params.set('where', options.where ?? source.where ?? '1=1')
  params.set('outFields', options.outFields?.join(',') ?? '*')
  params.set('returnGeometry', options.returnGeometry === false ? 'false' : 'true')
  params.set('outSR', String(options.outSR ?? 4326))

  if (options.orderByFields) params.set('orderByFields', options.orderByFields)
  if (options.resultOffset !== undefined) params.set('resultOffset', String(options.resultOffset))
  if (options.resultRecordCount !== undefined) params.set('resultRecordCount', String(options.resultRecordCount))
  if (options.geometry) params.set('geometry', options.geometry)
  if (options.geometryType) params.set('geometryType', options.geometryType)
  if (options.spatialRel) params.set('spatialRel', options.spatialRel)
  if (options.inSR !== undefined) params.set('inSR', String(options.inSR))
  if (options.returnDistinctValues) params.set('returnDistinctValues', 'true')

  const res = await fetch(`${normalizeArcGISUrl(source.url)}/query?${params.toString()}`, {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) {
    throw new Error(`ArcGIS ${res.status}: ${source.url}`)
  }

  const payload = await res.json() as ArcGISQueryResponse<T>
  return payload.features ?? []
}

export async function arcgisQueryAll<T = Record<string, unknown>>(
  source: ArcGISLayerSource,
  options: ArcGISQueryOptions = {}
): Promise<ArcGISFeature<T>[]> {
  const rows: ArcGISFeature<T>[] = []
  const pageSize = source.pageSize ?? options.resultRecordCount ?? DEFAULT_PAGE_SIZE
  const maxPages = source.maxPages ?? DEFAULT_MAX_PAGES

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await arcgisQuery<T>(source, {
      ...options,
      resultOffset: page * pageSize,
      resultRecordCount: pageSize,
    })

    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }
  }

  return rows
}

export async function arcgisQueryGeoJSON<T = Record<string, unknown>>(
  source: ArcGISLayerSource,
  options: Omit<ArcGISQueryOptions, 'returnGeometry'> = {}
): Promise<ArcGISGeoJSONFeature<T>[]> {
  const params = new URLSearchParams()
  params.set('f', 'geojson')
  params.set('where', options.where ?? source.where ?? '1=1')
  params.set('outFields', options.outFields?.join(',') ?? '*')

  if (options.orderByFields) params.set('orderByFields', options.orderByFields)
  if (options.geometry) params.set('geometry', options.geometry)
  if (options.geometryType) params.set('geometryType', options.geometryType)
  if (options.spatialRel) params.set('spatialRel', options.spatialRel)
  if (options.inSR !== undefined) params.set('inSR', String(options.inSR))
  if (options.outSR !== undefined) params.set('outSR', String(options.outSR))

  const res = await fetch(`${normalizeArcGISUrl(source.url)}/query?${params.toString()}`, {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) {
    throw new Error(`ArcGIS GeoJSON ${res.status}: ${source.url}`)
  }

  const payload = await res.json() as ArcGISGeoJSONResponse<T>
  return payload.features ?? []
}

export function normalizeArcGISUrl(url: string): string {
  return url.endsWith('/query') ? url.slice(0, -'/query'.length) : url.replace(/\/$/, '')
}

export function arcgisDateLiteral(isoDate: string): string {
  const date = new Date(isoDate)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `DATE '${year}-${month}-${day} ${hours}:${minutes}:${seconds}'`
}

export function combineArcGISWhere(...clauses: Array<string | undefined | null>): string {
  const filtered = clauses
    .map((clause) => clause?.trim())
    .filter((clause): clause is string => Boolean(clause))

  return filtered.length ? filtered.map((clause) => `(${clause})`).join(' AND ') : '1=1'
}

export function envelopeFromBounds(bounds: DistrictBounds): string {
  return `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`
}

export function getArcGISPoint(
  feature: ArcGISFeature<Record<string, unknown>>,
  latField?: string,
  lngField?: string
): { lat: number; lng: number } | null {
  if (latField && lngField) {
    const lat = feature.attributes[latField]
    const lng = feature.attributes[lngField]
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null && lng !== '') {
      return {
        lat: Number(lat),
        lng: Number(lng),
      }
    }
  }

  const geometry = feature.geometry
  if (
    geometry &&
    typeof geometry === 'object' &&
    'x' in geometry &&
    'y' in geometry &&
    geometry.x !== null &&
    geometry.y !== null
  ) {
    return {
      lat: Number(geometry.y),
      lng: Number(geometry.x),
    }
  }

  return null
}
