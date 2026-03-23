import { getCached } from '@/lib/cache'
import { arcgisDateLiteral, arcgisQueryAll, combineArcGISWhere, envelopeFromBounds, getArcGISPoint } from '@/lib/arcgis'
import { parseDistrictId } from '@/lib/districts'
import { cartoSqlFetch, escapeSqlString } from '@/lib/carto'
import { socrataFetch, socrataFetchAll, daysAgo } from '@/lib/socrata'
import { CACHE_TTL } from '@/config/app'
import type { ArcGISLayerSource, CityConfig, FieldMap } from '@/types/city'
import { isArcGISLayerSource } from '@/types/city'
import type { PermitRaw } from '@/types/socrata'
import { getDistrictBbox, getDistrictGeometry, pointInDistrict } from './districtGeometry'

export interface Permit {
  id: string
  permitNumber: string
  permitType: string
  address: string | null
  ward: number | null
  issueDate: string | null
  workDescription: string | null
  fullWorkDescription: string | null
  totalFee: number | null
  latitude: number | null
  longitude: number | null
  contactName: string | null
  isLargeDevelopment: boolean
}

type DataView = 'preview' | 'full'

function normalizePermitCoordinates(latitude: number | null, longitude: number | null): {
  latitude: number | null
  longitude: number | null
} {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001)
  ) {
    return { latitude: null, longitude: null }
  }

  return { latitude, longitude }
}

export async function getPermits(
  wardId: number,
  city: CityConfig,
  days = 180,
  view: DataView = 'preview'
): Promise<Permit[]> {
  const cacheKey = `${city.key}:permits:v4:ward:${wardId}:${days}d:${view}`

  return getCached(
    cacheKey,
    city.key,
    'permits',
    () => fetchPermits(wardId, city, days, view),
    CACHE_TTL.permits,
    wardId
  )
}

async function fetchPermits(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView
): Promise<Permit[]> {
  if (city.key === 'philadelphia') {
    return fetchPhiladelphiaPermits(wardId, city, days, view)
  }

  const datasetSource = city.datasets.permits
  if (!datasetSource) {
    throw new Error(`Permit dataset not configured for ${city.key}`)
  }

  if (isArcGISLayerSource(datasetSource)) {
    try {
      return fetchArcGISPermits(wardId, city, days, view, datasetSource)
    } catch {
      throw new Error(`Failed to load permit data for ${city.key}`)
    }
  }

  try {
    const datasetId = datasetSource
    const f = city.fields
    const districtCol = f.permitDistrict ?? f.districtCol ?? 'ward'
    const issueDateCol = f.permitIssueDate ?? 'issue_date'
    const since = daysAgo(days)
    const districtMatch = buildDistrictMatch(
      wardId,
      city,
      districtCol,
      f.permitDistrictNumeric,
      f.permitDistrictPad
    )

    const query = {
      $where: `${districtMatch} AND ${issueDateCol} >= '${since}'`,
      $order: `${issueDateCol} DESC`,
    }

    const raw = view === 'full'
      ? await socrataFetchAll<PermitRaw>(datasetId, query, city)
      : await socrataFetch<PermitRaw>(datasetId, { ...query, $limit: 100 }, city)

    return raw.map((r): Permit => {
      const row = r as unknown as Record<string, string>
      const feeCol = f.permitFee ?? 'total_fee'
      const fee = row[feeCol] ? parseFloat(row[feeCol]) : null

      // Address: either a single column or assembled from parts
      let address: string | null = null
      if (f.permitAddress) {
        address = row[f.permitAddress] ?? null
      } else if (f.permitAddressParts) {
        address = f.permitAddressParts.map((col) => row[col]).filter(Boolean).join(' ') || null
      }

      const distVal = row[districtCol]
      const latCol = f.permitLat ?? 'latitude'
      const lngCol = f.permitLng ?? 'longitude'
      const typeVal = row[f.permitType ?? 'permit_type']
      const descriptions = getPermitDescriptions(row, f)
      const coordinates = normalizePermitCoordinates(
        row[latCol] ? parseFloat(row[latCol]) : null,
        row[lngCol] ? parseFloat(row[lngCol]) : null
      )

      return {
        id: row[f.permitId ?? 'id'] ?? row[f.permitNumber ?? 'permit_'] ?? `${typeVal}:${address ?? 'unknown'}`,
        permitNumber: row[f.permitNumber ?? 'permit_'] ?? row[f.permitId ?? 'id'] ?? 'Unknown',
        permitType: typeVal,
        address,
        ward: distVal ? parseInt(distVal, 10) : null,
        issueDate: row[issueDateCol]?.split('T')[0] ?? null,
        workDescription: descriptions.preview,
        fullWorkDescription: descriptions.expanded,
        totalFee: fee,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        contactName: row[f.permitContact ?? 'contact_1_name'] ?? null,
        isLargeDevelopment:
          ((fee !== null && fee >= 50000) ||
            /new|addition|construction|erect|mixed-use|tower/i.test(`${typeVal ?? ''} ${descriptions.expanded ?? descriptions.preview ?? ''}`)),
      }
    })
  } catch {
    throw new Error(`Failed to load permit data for ${city.key}`)
  }
}

async function fetchArcGISPermits(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView,
  source: ArcGISLayerSource
): Promise<Permit[]> {
  const f = city.fields
  const issueDateCol = f.permitIssueDate ?? 'issue_date'
  const districtCol = f.permitDistrict
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
    `${issueDateCol} >= ${sinceLiteral}`,
    hasDirectDistrict && districtCol
      ? buildArcGISDistrictMatch(city, districtCol, wardId, f.permitDistrictNumeric, f.permitDistrictPad)
      : undefined
  )

  const features = await arcgisQueryAll<Record<string, unknown>>(source, {
    where,
    outFields: uniqueFields([
      f.permitId,
      f.permitNumber,
      f.permitType,
      issueDateCol,
      f.permitAddress,
      ...(f.permitAddressParts ?? []),
      f.permitDescription,
      ...(f.permitDescriptionFallbacks ?? []),
      f.permitExpandedDescription,
      ...(f.permitExpandedDescriptionFallbacks ?? []),
      f.permitFee,
      f.permitLat,
      f.permitLng,
      f.permitContact,
      districtCol,
    ]),
    orderByFields: `${issueDateCol} DESC`,
    returnGeometry: true,
    outSR: 4326,
    ...geometryFilter,
  })

  const permits: Permit[] = []

  for (const feature of features) {
    const row = feature.attributes
    const coords = getArcGISPoint(feature, f.permitLat, f.permitLng)
    if (!hasDirectDistrict) {
      if (!coords || !geometry || !pointInDistrict(coords.lat, coords.lng, geometry)) continue
    }

    const issueDate = normalizeDateValue(row[issueDateCol])
    const feeRaw = row[f.permitFee ?? 'total_fee']
    const fee = feeRaw !== undefined && feeRaw !== null && feeRaw !== '' ? Number(feeRaw) : null
    const permitType = String(row[f.permitType ?? 'permit_type'] ?? 'Permit')
    const descriptions = getPermitDescriptions(row, f)
    const address = buildAddress(row, f.permitAddress, f.permitAddressParts)
    const coordinates = normalizePermitCoordinates(coords?.lat ?? null, coords?.lng ?? null)

    permits.push({
      id: String(row[f.permitId ?? 'id'] ?? row[f.permitNumber ?? 'permit_number'] ?? `${permitType}:${address ?? 'unknown'}`),
      permitNumber: String(row[f.permitNumber ?? 'permit_number'] ?? row[f.permitId ?? 'id'] ?? 'Unknown'),
      permitType,
      address,
      ward: districtCol ? (parseDistrictId(city, row[districtCol]) ?? wardId) : wardId,
      issueDate: issueDate?.split('T')[0] ?? null,
      workDescription: descriptions.preview,
      fullWorkDescription: descriptions.expanded,
      totalFee: Number.isFinite(fee) ? fee : null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      contactName: stringOrNull(row[f.permitContact ?? 'contact_name']),
      isLargeDevelopment:
        ((fee !== null && fee >= 50000) ||
          /new|addition|construction|erect|mixed-use|tower/i.test(`${permitType} ${descriptions.expanded ?? descriptions.preview ?? ''}`)),
    })
  }

  const enrichedPermits = city.key === 'raleigh'
    ? await enrichRaleighPermitDescriptions(permits)
    : permits

  return view === 'full' ? enrichedPermits : enrichedPermits.slice(0, 150)
}

async function fetchPhiladelphiaPermits(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView
): Promise<Permit[]> {
  const since = daysAgo(days)
  const sql = `
    SELECT
      permitnumber,
      permittype,
      permitdescription,
      typeofwork,
      approvedscopeofwork,
      permitissuedate,
      contractorname,
      address,
      council_district,
      ST_Y(the_geom) AS lat,
      ST_X(the_geom) AS lng
    FROM permits
    WHERE council_district = '${escapeSqlString(String(wardId))}'
      AND permitissuedate >= '${since}'
    ORDER BY permitissuedate DESC
    LIMIT ${view === 'full' ? 1000 : 150}
  `.replace(/\s+/g, ' ').trim()

  const rows = await cartoSqlFetch<{
    permitnumber?: string
    permittype?: string
    permitdescription?: string
    typeofwork?: string
    approvedscopeofwork?: string
    permitissuedate?: string
    contractorname?: string
    address?: string
    council_district?: string
    lat?: number | string
    lng?: number | string
  }>(sql)

  return rows.map((row) => {
    const typeVal = row.permittype ?? row.typeofwork ?? 'Permit'
    const description = row.approvedscopeofwork ?? row.permitdescription ?? row.typeofwork ?? null
    const coordinates = normalizePermitCoordinates(
      row.lat !== undefined ? Number(row.lat) : null,
      row.lng !== undefined ? Number(row.lng) : null
    )

    return {
      id: row.permitnumber ?? `${typeVal}:${row.address ?? 'unknown'}`,
      permitNumber: row.permitnumber ?? 'Unknown',
      permitType: typeVal,
      address: row.address ?? null,
      ward: row.council_district ? parseInt(row.council_district, 10) : wardId,
      issueDate: row.permitissuedate?.split('T')[0] ?? null,
      workDescription: description,
      fullWorkDescription: description,
      totalFee: null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      contactName: row.contractorname ?? null,
      isLargeDevelopment:
        /new|addition|alteration|multi|commercial|apartment/i.test(`${typeVal} ${description ?? ''}`),
    }
  })
}

function getPermitDescriptions(
  row: Record<string, unknown>,
  fields: FieldMap
): { preview: string | null; expanded: string | null } {
  const preview = normalizePermitText(longestNonEmptyString(
    row[fields.permitDescription ?? 'work_description'],
    ...(fields.permitDescriptionFallbacks ?? []).map((field) => row[field])
  ))

  const expanded = normalizePermitText(longestNonEmptyString(
    row[fields.permitExpandedDescription ?? fields.permitDescription ?? 'work_description'],
    ...(fields.permitExpandedDescriptionFallbacks ?? []).map((field) => row[field]),
    preview
  ))

  return {
    preview,
    expanded: expanded ?? preview,
  }
}

function normalizePermitText(value: string | null): string | null {
  if (!value) return null

  const cleaned = value
    .replace(/\s*-----+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || null
}

async function enrichRaleighPermitDescriptions(permits: Permit[]): Promise<Permit[]> {
  const lookupNumbers = Array.from(new Set(
    permits
      .filter((permit) => shouldFetchRaleighPermitDescription(permit))
      .map((permit) => permit.permitNumber)
  ))

  if (lookupNumbers.length === 0) {
    return permits
  }

  const resolvedDescriptions = new Map<string, string | null>()

  for (let index = 0; index < lookupNumbers.length; index += 8) {
    const chunk = lookupNumbers.slice(index, index + 8)
    const results = await Promise.all(
      chunk.map(async (permitNumber) => [permitNumber, await getRaleighPermitFullDescription(permitNumber)] as const)
    )

    for (const [permitNumber, description] of results) {
      resolvedDescriptions.set(permitNumber, description)
    }
  }

  return permits.map((permit) => {
    const enrichedDescription = resolvedDescriptions.get(permit.permitNumber)
    if (!enrichedDescription) {
      return permit
    }

    const currentDescription = permit.fullWorkDescription ?? permit.workDescription
    if (currentDescription && enrichedDescription.length <= currentDescription.length) {
      return permit
    }

    return {
      ...permit,
      fullWorkDescription: enrichedDescription,
    }
  })
}

function shouldFetchRaleighPermitDescription(permit: Permit): boolean {
  const description = permit.fullWorkDescription ?? permit.workDescription
  if (!description) return false

  const lastWord = description.trim().split(/\s+/).pop() ?? ''
  return description.length >= 98 && lastWord.length <= 4 && !/[.!?)]$/.test(description)
}

async function getRaleighPermitFullDescription(permitNumber: string): Promise<string | null> {
  const cached = await getCached(
    `raleigh:permit:scope:v1:${permitNumber}`,
    'raleigh',
    'permit-scope',
    async () => ({ description: await fetchRaleighPermitFullDescription(permitNumber) }),
    CACHE_TTL.permits
  )

  return cached.description ?? null
}

async function fetchRaleighPermitFullDescription(permitNumber: string): Promise<string | null> {
  const criteria = await getRaleighPermitSearchCriteria()
  const payload = buildRaleighPermitSearchPayload(criteria, permitNumber)

  const res = await fetch('https://raleighnc-energovpub.tylerhost.net/apps/selfservice/api/energov/search/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CityPulse/1.0',
      tenantId: '1',
      tenantName: 'RaleighNCProd',
      'Tyler-TenantUrl': 'RaleighNCProd',
      'Tyler-Tenant-Culture': 'en-US',
    },
    body: JSON.stringify(payload),
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) {
    throw new Error(`Raleigh permit search ${res.status}: ${permitNumber}`)
  }

  const response = await res.json() as {
    Success?: boolean
    Result?: {
      EntityResults?: Array<{
        CaseNumber?: string
        Description?: string | null
        ModuleName?: number
      }>
    } | null
  }

  const match = response.Result?.EntityResults?.find((result) =>
    result.ModuleName === 2 && result.CaseNumber?.toUpperCase() === permitNumber.toUpperCase()
  )

  return normalizePermitText(match?.Description ?? null)
}

async function getRaleighPermitSearchCriteria(): Promise<Record<string, unknown>> {
  return getCached(
    'raleigh:permit-search:criteria:v1',
    'raleigh',
    'permit-search-criteria',
    fetchRaleighPermitSearchCriteria,
    24 * 60 * 60
  )
}

async function fetchRaleighPermitSearchCriteria(): Promise<Record<string, unknown>> {
  const res = await fetch('https://raleighnc-energovpub.tylerhost.net/apps/selfservice/api/energov/search/criteria', {
    headers: {
      'User-Agent': 'CityPulse/1.0',
      tenantId: '1',
      tenantName: 'RaleighNCProd',
      'Tyler-TenantUrl': 'RaleighNCProd',
      'Tyler-Tenant-Culture': 'en-US',
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) {
    throw new Error(`Raleigh permit search criteria ${res.status}`)
  }

  const response = await res.json() as { Success?: boolean; Result?: Record<string, unknown> | null }
  if (!response.Success || !response.Result) {
    throw new Error('Raleigh permit search criteria unavailable')
  }

  return response.Result
}

function buildRaleighPermitSearchPayload(
  criteria: Record<string, unknown>,
  permitNumber: string
): Record<string, unknown> {
  const payload = JSON.parse(JSON.stringify(criteria)) as Record<string, unknown>
  const permitCriteria = (payload.PermitCriteria as Record<string, unknown> | undefined) ?? {}

  payload.SearchModule = 1
  payload.FilterModule = 2
  payload.Keyword = permitNumber
  payload.ExactMatch = true
  payload.PageSize = 1
  payload.PageNumber = 1
  payload.SortBy = 'relevance'
  payload.SortAscending = false
  payload.PermitCriteria = {
    ...permitCriteria,
    PermitNumber: permitNumber,
    PermitTypeId: null,
    PermitWorkclassId: null,
    PermitStatusId: null,
    ProjectName: null,
    Address: null,
    Description: null,
    SearchMainAddress: false,
    EnableDescriptionSearch: false,
    PageSize: 1,
    PageNumber: 1,
    SortBy: 'PermitNumber.keyword',
    SortAscending: false,
  }

  return payload
}

function buildDistrictMatch(
  wardId: number,
  city: CityConfig,
  districtCol: string,
  numericOverride?: boolean,
  padOverride?: number
): string {
  const numeric = numericOverride ?? city.districtNumeric ?? false
  const pad = padOverride ?? city.districtPad
  const districtVal = pad ? String(wardId).padStart(pad, '0') : String(wardId)
  return numeric ? `${districtCol}=${wardId}` : `${districtCol}='${districtVal}'`
}

function buildArcGISDistrictMatch(
  city: CityConfig,
  districtCol: string,
  wardId: number,
  numericOverride?: boolean,
  padOverride?: number
): string {
  const districtLabel = city.districtLabels?.[wardId]
  if (districtLabel) {
    return `${districtCol}='${districtLabel.replace(/'/g, "''")}'`
  }

  const numeric = numericOverride ?? city.districtNumeric ?? false
  const pad = padOverride ?? city.districtPad
  const districtVal = pad ? String(wardId).padStart(pad, '0') : String(wardId)
  return numeric ? `${districtCol}=${wardId}` : `${districtCol}='${districtVal.replace(/'/g, "''")}'`
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

function longestNonEmptyString(...values: unknown[]): string | null {
  let longest: string | null = null

  for (const value of values) {
    const text = stringOrNull(value)
    if (!text) continue
    if (!longest || text.length > longest.length) {
      longest = text
    }
  }

  return longest
}

function buildAddress(
  row: Record<string, unknown>,
  singleColumn?: string,
  parts?: string[]
): string | null {
  if (singleColumn) {
    return stringOrNull(row[singleColumn])
  }

  if (parts?.length) {
    const address = parts
      .map((part) => stringOrNull(row[part]))
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim()

    return address || null
  }

  return null
}

function uniqueFields(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}
