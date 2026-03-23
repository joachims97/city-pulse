import { getCached } from '@/lib/cache'
import { arcgisDateLiteral, arcgisQueryAll, combineArcGISWhere, envelopeFromBounds, getArcGISPoint } from '@/lib/arcgis'
import { parseDistrictId } from '@/lib/districts'
import { cartoSqlFetch } from '@/lib/carto'
import { socrataFetch, socrataFetchAll, daysAgo } from '@/lib/socrata'
import { CACHE_TTL } from '@/config/app'
import type { ArcGISLayerSource, CityConfig } from '@/types/city'
import { isArcGISLayerSource } from '@/types/city'
import type { Complaint311Raw } from '@/types/socrata'
import { getDistrictBbox, getDistrictGeometry, pointInDistrict } from './districtGeometry'

export interface Complaint {
  srNumber: string
  srType: string
  status: string
  ward: number | null
  streetAddress: string | null
  createdDate: string
  closedDate: string | null
  latitude: number | null
  longitude: number | null
  resolutionDays: number | null
}

export interface ComplaintsStats {
  total: number
  byType: { type: string; count: number }[]
  openCount: number
  closedCount: number
}

type DataView = 'preview' | 'full'

export async function getComplaints(
  wardId: number,
  city: CityConfig,
  days = 90,
  view: DataView = 'preview'
): Promise<{ complaints: Complaint[]; stats: ComplaintsStats }> {
  const cacheKey = `${city.key}:311:v4:ward:${wardId}:${days}d:${view}`

  return getCached(
    cacheKey,
    city.key,
    '311',
    () => fetchComplaints(wardId, city, days, view),
    CACHE_TTL.complaints311,
    wardId
  )
}

async function fetchComplaints(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView
): Promise<{ complaints: Complaint[]; stats: ComplaintsStats }> {
  if (city.key === 'philadelphia') {
    const complaints = await fetchPhiladelphiaComplaints(wardId, city, days, view)
    return { complaints, stats: computeStats(complaints) }
  }

  const datasetSource = city.datasets.complaints311
  if (!datasetSource) {
    throw new Error(`311 dataset not configured for ${city.key}`)
  }

  if (isArcGISLayerSource(datasetSource)) {
    try {
      const complaints = await fetchArcGISComplaints(wardId, city, days, view, datasetSource)
      return { complaints, stats: computeStats(complaints) }
    } catch (err) {
      throw new Error(`Failed to load 311 data for ${city.key}`)
    }
  }

  try {
    const datasetId = datasetSource
    const f = city.fields
    const districtCol = f.districtCol ?? 'ward'
    const createdDateCol = f.srCreatedDate ?? 'created_date'
    const since = daysAgo(days)

    const districtVal = city.districtPad
      ? String(wardId).padStart(city.districtPad, '0')
      : String(wardId)
    const districtMatch = city.districtNumeric
      ? `${districtCol}=${wardId}`
      : `${districtCol}='${districtVal}'`

    const query = {
      $where: `${districtMatch} AND ${createdDateCol} >= '${since}'`,
      $order: `${createdDateCol} DESC`,
    }

    const raw = view === 'full'
      ? await socrataFetchAll<Complaint311Raw>(datasetId, query, city, undefined, 2000)
      : await socrataFetch<Complaint311Raw>(datasetId, { ...query, $limit: 200 }, city)

    const complaints: Complaint[] = raw.map((r) => {
      const createdKey = f.srCreatedDate ?? 'created_date'
      const closedKey = f.srClosedDate ?? 'closed_date'
      const row = r as unknown as Record<string, string>
      const created = new Date(row[createdKey])
      const closedVal = row[closedKey]
      const closed = closedVal ? new Date(closedVal) : null
      const resolutionDays = closed
        ? Math.round((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        : null

      return {
        srNumber: row[f.srNumber ?? 'sr_number'],
        srType: row[f.srType ?? 'sr_type'],
        status: row[f.srStatus ?? 'status'],
        ward: row[districtCol] ? parseInt(row[districtCol], 10) : null,
        streetAddress: row[f.srAddress ?? 'street_address'] ?? null,
        createdDate: row[createdKey],
        closedDate: closedVal ?? null,
        latitude: row[f.srLat ?? 'latitude'] ? parseFloat(row[f.srLat ?? 'latitude']) : null,
        longitude: row[f.srLng ?? 'longitude'] ? parseFloat(row[f.srLng ?? 'longitude']) : null,
        resolutionDays,
      }
    })

    const stats = computeStats(complaints)
    return { complaints, stats }
  } catch {
    throw new Error(`Failed to load 311 data for ${city.key}`)
  }
}

async function fetchArcGISComplaints(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView,
  source: ArcGISLayerSource
): Promise<Complaint[]> {
  const f = city.fields
  const createdDateCol = f.srCreatedDate ?? 'created_date'
  const closedDateCol = f.srClosedDate ?? 'closed_date'
  const districtCol = f.districtCol
  const sinceLiteral = arcgisDateLiteral(daysAgo(days))
  const hasDirectDistrict = Boolean(districtCol)

  let geometry = null
  let geometryFilter: { geometry: string; geometryType: string; spatialRel: string; inSR: number } | undefined

  if (!hasDirectDistrict) {
    geometry = await getDistrictGeometry(wardId, city)
    const bbox = await getDistrictBbox(wardId, city)
    if (!geometry || !bbox) {
      throw new Error(`District geometry unavailable for ${city.key}:${wardId}`)
    }

    geometryFilter = {
      geometry: envelopeFromBounds(bbox),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: 4326,
    }
  }

  const where = combineArcGISWhere(
    source.where,
    `${createdDateCol} >= ${sinceLiteral}`,
    hasDirectDistrict && districtCol ? buildArcGISDistrictMatch(city, districtCol, wardId) : undefined
  )

  const features = await arcgisQueryAll<Record<string, unknown>>(source, {
    where,
    outFields: uniqueFields([
      f.srNumber,
      f.srType,
      ...(f.srTypeFallbacks ?? []),
      f.srStatus,
      createdDateCol,
      f.srClosedDate,
      f.srAddress,
      f.srLat,
      f.srLng,
      districtCol,
    ]),
    orderByFields: `${createdDateCol} DESC`,
    returnGeometry: true,
    outSR: 4326,
    ...geometryFilter,
  })

  const complaints: Complaint[] = []

  for (const feature of features) {
    const row = feature.attributes
    const coords = getArcGISPoint(feature, f.srLat, f.srLng)
    if (!hasDirectDistrict) {
      if (!coords || !geometry || !pointInDistrict(coords.lat, coords.lng, geometry)) continue
    }

    const createdDate = normalizeDateValue(row[createdDateCol])
    if (!createdDate) continue

    const closedDate = f.srClosedDate ? normalizeDateValue(row[closedDateCol]) : null
    const created = new Date(createdDate)
    const closed = closedDate ? new Date(closedDate) : null
    const resolutionDays =
      closed && !Number.isNaN(created.getTime())
        ? Math.round((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        : null
    const srType = firstNonEmptyString(
      row[f.srType ?? 'sr_type'],
      ...(f.srTypeFallbacks ?? []).map((field) => row[field])
    ) ?? '311 Request'

    complaints.push({
      srNumber: String(row[f.srNumber ?? 'sr_number'] ?? 'Unknown'),
      srType,
      status: f.srStatus ? String(row[f.srStatus] ?? 'Submitted') : 'Submitted',
      ward: districtCol ? (parseDistrictId(city, row[districtCol]) ?? wardId) : wardId,
      streetAddress: stringOrNull(row[f.srAddress ?? 'street_address']),
      createdDate,
      closedDate,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      resolutionDays,
    })
  }

  return view === 'full' ? complaints : complaints.slice(0, 200)
}

async function fetchPhiladelphiaComplaints(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView
): Promise<Complaint[]> {
  const geometry = await getDistrictGeometry(wardId, city)
  const bbox = await getDistrictBbox(wardId, city)
  if (!geometry || !bbox) {
    throw new Error(`District geometry unavailable for ${city.key}:${wardId}`)
  }

  const since = daysAgo(days)
  const rows = await cartoSqlFetch<{
    service_request_id?: number | string
    service_name?: string
    status?: string
    requested_datetime?: string
    closed_datetime?: string
    address?: string
    lat?: number | string
    lon?: number | string
  }>(
    `
      SELECT
        service_request_id,
        service_name,
        status,
        requested_datetime,
        closed_datetime,
        address,
        lat,
        lon
      FROM public_cases_fc
      WHERE requested_datetime >= '${since}'
        AND lat BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
        AND lon BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
      ORDER BY requested_datetime DESC
      LIMIT ${view === 'full' ? 2000 : 500}
    `.replace(/\s+/g, ' ').trim()
  )

  const complaints: Complaint[] = []

  for (const row of rows) {
    const latitude = row.lat !== undefined ? Number(row.lat) : null
    const longitude = row.lon !== undefined ? Number(row.lon) : null

    if (latitude === null || longitude === null || !pointInDistrict(latitude, longitude, geometry)) {
      continue
    }

    const createdDate = row.requested_datetime ?? ''
    const closedDate = row.closed_datetime ?? null
    const created = createdDate ? new Date(createdDate) : null
    const closed = closedDate ? new Date(closedDate) : null
    const resolutionDays =
      created && closed
        ? Math.round((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        : null

    complaints.push({
      srNumber: String(row.service_request_id ?? ''),
      srType: row.service_name ?? '311 Request',
      status: row.status ?? 'Unknown',
      ward: wardId,
      streetAddress: row.address ?? null,
      createdDate,
      closedDate,
      latitude,
      longitude,
      resolutionDays,
    })
  }

  return complaints
}

function computeStats(complaints: Complaint[]): ComplaintsStats {
  const byType = new Map<string, number>()

  for (const c of complaints) {
    byType.set(c.srType, (byType.get(c.srType) ?? 0) + 1)
  }

  const sorted = Array.from(byType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  return {
    total: complaints.length,
    byType: sorted.slice(0, 10),
    openCount: complaints.filter((c) => c.status !== 'Closed').length,
    closedCount: complaints.filter((c) => c.status === 'Closed').length,
  }
}

function normalizeDateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  const parsed = typeof value === 'number'
    ? new Date(value)
    : new Date(String(value))

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = stringOrNull(value)
    if (text) return text
  }

  return null
}

function buildArcGISDistrictMatch(city: CityConfig, districtCol: string, wardId: number): string {
  const districtLabel = city.districtLabels?.[wardId]

  if (districtLabel) {
    return `${districtCol} = '${districtLabel.replace(/'/g, "''")}'`
  }

  return city.districtNumeric
    ? `${districtCol} = ${wardId}`
    : `${districtCol} = '${String(wardId).replace(/'/g, "''")}'`
}

function uniqueFields(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}
