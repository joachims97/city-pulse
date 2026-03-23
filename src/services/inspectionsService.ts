import { getCached } from '@/lib/cache'
import { arcgisDateLiteral, arcgisQueryAll, combineArcGISWhere, envelopeFromBounds, getArcGISPoint } from '@/lib/arcgis'
import { parseDistrictId } from '@/lib/districts'
import { escapeSqlString } from '@/lib/carto'
import { prisma } from '@/lib/prisma'
import { socrataFetch, socrataFetchAll, daysAgo } from '@/lib/socrata'
import { CACHE_TTL } from '@/config/app'
import type { ArcGISLayerSource, CharlotteHealthInspectionSource, CityConfig } from '@/types/city'
import { isArcGISLayerSource, isCharlotteHealthInspectionSource } from '@/types/city'
import type { InspectionRaw } from '@/types/socrata'
import { getDistrictBbox, getDistrictGeometry, pointInDistrict } from './districtGeometry'

export interface Inspection {
  id: string
  dbaName: string
  address: string | null
  zip: string | null
  inspectionType: string | null
  results: string | null
  violations: string | null
  details: string | null
  inspectionDate: string | null
  latitude: number | null
  longitude: number | null
  ward: number | null
  riskLevel: string | null
  isFailed: boolean
  isRecentFail: boolean
}

interface StoredPhiladelphiaInspectionRow {
  inspectionId: string
  dbaName: string
  address: string | null
  zip: string | null
  inspectionType: string | null
  results: string | null
  violations: string | null
  inspectionDate: Date | null
  latitude: number | null
  longitude: number | null
  ward: number | null
  createdAt: Date
}

type DataView = 'preview' | 'full'

function normalizeInspectionCoordinates(latitude: number | null, longitude: number | null): {
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

export async function getInspections(
  wardId: number,
  city: CityConfig,
  days = 365,
  view: DataView = 'preview'
): Promise<Inspection[]> {
  const cacheKey = `${city.key}:inspections:v12:ward:${wardId}:${days}d:${view}`

  return getCached(
    cacheKey,
    city.key,
    'inspections',
    () => fetchInspections(wardId, city, days, view),
    CACHE_TTL.inspections,
    wardId
  )
}

async function fetchInspections(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView
): Promise<Inspection[]> {
  if (city.key === 'philadelphia') {
    return fetchPhiladelphiaInspections(wardId, city, days, view)
  }

  const datasetSource = city.datasets.inspections
  if (!datasetSource) {
    throw new Error(`Inspection dataset not configured for ${city.key}`)
  }

  if (isCharlotteHealthInspectionSource(datasetSource)) {
    try {
      return fetchCharlotteHealthInspections(wardId, city, days, view, datasetSource)
    } catch {
      throw new Error(`Failed to load inspection data for ${city.key}`)
    }
  }

  if (isArcGISLayerSource(datasetSource)) {
    try {
      return fetchArcGISInspections(wardId, city, days, view, datasetSource)
    } catch {
      throw new Error(`Failed to load inspection data for ${city.key}`)
    }
  }

  try {
    const datasetId = datasetSource
    const f = city.fields
    const since = daysAgo(days)
    const inspDateCol = f.inspectionDate ?? 'inspection_date'
    const districtCol = f.inspectionDistrict
    const locationCol = f.inspectionLocation ?? 'location'
    let districtGeometry = null

    let whereClause: string

    if (districtCol) {
      // City has a district column in the inspections dataset — use it directly
      whereClause = `${buildDistrictMatch(
        wardId,
        city,
        districtCol,
        f.inspectionDistrictNumeric,
        f.inspectionDistrictPad
      )} AND ${inspDateCol} >= '${since}'`
    } else {
      // No district column — fall back to district geometry + bbox query
      districtGeometry = await getDistrictGeometry(wardId, city)
      const bbox = await getDistrictBbox(wardId, city)
      if (!bbox) throw new Error('Could not fetch district boundary for spatial query')
      whereClause =
        `within_box(${locationCol},${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}) ` +
        `AND ${inspDateCol} >= '${since}'`
    }

    const query = {
      $where: whereClause,
      $order: `${inspDateCol} DESC`,
    }

    const fullPageSize = city.key === 'nyc' ? 500 : districtGeometry ? 300 : 200
    const fullMaxPages = city.key === 'nyc' ? 50 : 20

    const raw = view === 'full'
      ? await socrataFetchAll<InspectionRaw>(
          datasetId,
          query,
          city,
          city.datasets.inspectionsHost,
          fullPageSize,
          fullMaxPages
        )
      : await socrataFetch<InspectionRaw>(
          datasetId,
          { ...query, $limit: districtGeometry ? 300 : 100 },
          city,
          city.datasets.inspectionsHost
        )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const filtered = districtGeometry
      ? raw.filter((r) => {
          const row = r as unknown as Record<string, unknown>
          const coords = getInspectionCoordinates(row, f)
          return coords ? pointInDistrict(coords.lat, coords.lng, districtGeometry!) : false
        })
      : raw

    const normalizedRows = await normalizeInspectionRows(filtered, city, datasetId)
    const inspections = mapInspectionRows(
      normalizedRows as unknown as Array<Record<string, unknown>>,
      city,
      wardId,
      inspDateCol,
      districtCol
    )

    return city.key === 'nyc' ? groupNewYorkCityInspections(inspections) : inspections
  } catch {
    throw new Error(`Failed to load inspection data for ${city.key}`)
  }
}

function mapInspectionRows(
  rows: Array<Record<string, unknown>>,
  city: CityConfig,
  wardId: number,
  inspDateCol: string,
  districtCol?: string
): Inspection[] {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return rows.map((rawRow): Inspection => {
    const row = rawRow as Record<string, string>
    const f = city.fields
    const resultVal = getInspectionResult(row, f)
    const coords = getInspectionCoordinates(rawRow, f)
    const isFailed = isInspectionFailure(resultVal)
    const dateStr = normalizeDateValue(rawRow[inspDateCol]) ?? row[inspDateCol] ?? null
    const inspDate = dateStr ? new Date(dateStr) : null
    const isRecentFail = isFailed && inspDate ? inspDate > thirtyDaysAgo : false
    const districtVal = districtCol ? rawRow[districtCol] : null
    const address = getInspectionAddress(row, f)
    const inspectionType = getInspectionType(row, f)
    const dbaName = getInspectionDisplayName(row, f, address, inspectionType)
    const noteSummary = classifyInspectionNotes(city, row, getInspectionViolations(row, f))
    const coordinates = normalizeInspectionCoordinates(coords?.lat ?? null, coords?.lng ?? null)

    return {
      id:
        row[f.inspectionId ?? 'inspection_id'] ??
        `${dbaName}:${address ?? ''}:${dateStr ?? ''}:${resultVal ?? ''}`,
      dbaName,
      address,
      zip: row[f.inspectionZip ?? 'zip'] ?? null,
      inspectionType,
      results: resultVal ?? null,
      violations: noteSummary.violations,
      details: noteSummary.details,
      inspectionDate: dateStr?.split('T')[0] ?? null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      ward: districtVal ? (parseDistrictId(city, districtVal) ?? wardId) : wardId,
      riskLevel: getInspectionRisk(row, f),
      isFailed,
      isRecentFail,
    }
  })
}

async function fetchArcGISInspections(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView,
  source: ArcGISLayerSource
): Promise<Inspection[]> {
  const f = city.fields
  const inspDateCol = f.inspectionDate ?? 'inspection_date'
  const districtCol = f.inspectionDistrict
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
    `${inspDateCol} >= ${sinceLiteral}`,
    hasDirectDistrict && districtCol
      ? buildArcGISDistrictMatch(city, districtCol, wardId, f.inspectionDistrictNumeric, f.inspectionDistrictPad)
      : undefined
  )

  const features = await arcgisQueryAll<Record<string, unknown>>(source, {
    where,
    outFields: uniqueFields([
      f.inspectionId,
      f.inspectionName,
      f.inspectionDate,
      f.inspectionAddress,
      ...(f.inspectionAddressParts ?? []),
      f.inspectionZip,
      f.inspectionRisk,
      f.inspectionLat,
      f.inspectionLng,
      districtCol,
      'Address',
      'IsCompleted',
      'InspectionOrder',
      'PrimaryInspector',
    ]),
    orderByFields: `${inspDateCol} DESC`,
    returnGeometry: true,
    outSR: 4326,
    ...geometryFilter,
  })

  const rows: Array<Record<string, unknown>> = []

  for (const feature of features) {
    const row = { ...feature.attributes }
    const coords = getArcGISPoint(feature, f.inspectionLat, f.inspectionLng)

    if (!hasDirectDistrict) {
      if (!coords || !geometry || !pointInDistrict(coords.lat, coords.lng, geometry)) continue
    }

    if (coords) {
      row[f.inspectionLat ?? 'latitude'] = coords.lat
      row[f.inspectionLng ?? 'longitude'] = coords.lng
    }

    if (row[inspDateCol] !== undefined) {
      row[inspDateCol] = normalizeDateValue(row[inspDateCol])
    }

    if (!row[f.inspectionAddress ?? 'address'] && row.Address) {
      row[f.inspectionAddress ?? 'address'] = row.Address
    }

    if (!row[f.inspectionType ?? 'inspection_type']) {
      row[f.inspectionType ?? 'inspection_type'] = 'Building inspection'
    }

    if (!row[f.inspectionResult ?? 'inspection_result']) {
      row[f.inspectionResult ?? 'inspection_result'] = row.IsCompleted === 'True' ? 'Completed' : 'Scheduled'
    }

    if (!row[f.inspectionViolations ?? 'inspection_notes']) {
      const details = [
        row.PrimaryInspector ? `Inspector: ${String(row.PrimaryInspector)}` : null,
        row.InspectionOrder !== undefined ? `Stop: ${String(row.InspectionOrder)}` : null,
      ].filter(Boolean)

      if (details.length) {
        row[f.inspectionViolations ?? 'inspection_notes'] = details.join(' | ')
      }
    }

    rows.push(row)
  }

  const inspections = mapInspectionRows(rows, city, wardId, inspDateCol, districtCol)
  return view === 'full' ? inspections : inspections.slice(0, 150)
}

async function fetchCharlotteHealthInspections(
  wardId: number,
  city: CityConfig,
  days: number,
  view: DataView,
  source: CharlotteHealthInspectionSource
): Promise<Inspection[]> {
  const baseUrl = source.baseUrl ?? 'https://public.cdpehs.com/NCENVPBL/ESTABLISHMENT/ShowESTABLISHMENTTablePage.aspx?ESTTST_CTY=60'
  const cityFilter = source.cityFilter ?? 'CHARLOTTE'
  const maxRecords = source.maxRecords ?? (view === 'full' ? 250 : 120)
  const sinceDate = new Date(daysAgo(days))
  const districtGeometry = await getDistrictGeometry(wardId, city)
  if (!districtGeometry) {
    throw new Error(`District geometry unavailable for ${city.key}:${wardId}`)
  }

  let session = await fetchCharlotteInspectionPage(baseUrl)
  session = await postCharlotteInspectionPage(baseUrl, session, {
    'ctl00$PageContent$PREMISE_CITYFilter': cityFilter,
    'ctl00$PageContent$Pagination$_PageSize': '50',
    __EVENTTARGET: 'ctl00$PageContent$Pagination$_PageSizeButton',
    __EVENTARGUMENT: '',
  })

  const rows: CharlotteInspectionRow[] = []
  const totalPages = getCharlotteTotalPages(session.html)
  const maxPages = Math.min(totalPages, Math.max(2, Math.ceil(maxRecords / 50) + 2))

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const pageRows = parseCharlotteInspectionRows(session.html)
    let reachedOlderRows = false

    for (const row of pageRows) {
      if (row.city.toUpperCase() !== cityFilter.toUpperCase()) continue
      if (row.inspectionDate < sinceDate) {
        reachedOlderRows = true
        continue
      }

      rows.push(row)
      if (rows.length >= maxRecords) break
    }

    if (rows.length >= maxRecords || reachedOlderRows || pageIndex >= totalPages) {
      break
    }

    session = await postCharlotteInspectionPage(baseUrl, session, {
      __EVENTTARGET: 'ctl00$PageContent$Pagination$_NextPage',
      __EVENTARGUMENT: '',
    })
  }

  const geocoded = await geocodeCharlotteInspectionRows(rows, city)
  const normalizedRows: Array<Record<string, unknown>> = geocoded
    .filter((row) => row.latitude !== null && row.longitude !== null)
    .filter((row) => pointInDistrict(row.latitude!, row.longitude!, districtGeometry))
    .map((row) => ({
      inspection_id: row.stateId,
      dba_name: row.name,
      address: row.addressLine,
      zip: row.zip,
      inspection_type: row.establishmentType,
      inspection_result: row.result,
      inspection_notes: [
        `State ID: ${row.stateId}`,
        row.score !== null ? `Score: ${row.score}` : null,
        row.grade ? `Grade: ${row.grade}` : null,
        row.inspectorId ? `Inspector: ${row.inspectorId}` : null,
      ].filter(Boolean).join(' | '),
      inspection_date: row.inspectionDate.toISOString(),
      latitude: row.latitude,
      longitude: row.longitude,
      risk: row.grade && row.grade !== 'N/A' ? `Grade ${row.grade}` : null,
    }))

  const inspections = mapInspectionRows(normalizedRows, city, wardId, 'inspection_date')
  return view === 'full' ? inspections : inspections.slice(0, 120)
}

async function normalizeInspectionRows(
  rows: InspectionRaw[],
  city: CityConfig,
  datasetId: string
): Promise<InspectionRaw[]> {
  if (city.key === 'sf') {
    return enrichSanFranciscoInspections(rows, city, datasetId)
  }

  return rows
}

async function enrichSanFranciscoInspections(
  rows: InspectionRaw[],
  city: CityConfig,
  datasetId: string
): Promise<InspectionRaw[]> {
  const permitNumbers = Array.from(
    new Set(
      rows
        .map((row) => row as unknown as Record<string, string>)
        .filter((row) => !firstText(row.dba, row.business_name) && row.permit_number)
        .map((row) => row.permit_number)
    )
  )

  if (permitNumbers.length === 0) return rows

  const permitLookups = new Map<string, Record<string, string>>()

  for (let index = 0; index < permitNumbers.length; index += 40) {
    const batch = permitNumbers.slice(index, index + 40)
    const inClause = batch.map((permitNumber) => `'${escapeSqlString(permitNumber)}'`).join(',')
    const lookupRows = await socrataFetchAll<Record<string, string>>(
      datasetId,
      {
        $select: 'permit_number,dba,inspection_type,street_address_clean',
        $where: `permit_number IN (${inClause}) AND dba IS NOT NULL`,
        $order: 'inspection_date DESC',
      },
      city,
      city.datasets.inspectionsHost,
      500
    )

    for (const lookupRow of lookupRows) {
      const permitNumber = lookupRow.permit_number
      if (!permitNumber || permitLookups.has(permitNumber)) continue
      permitLookups.set(permitNumber, lookupRow)
    }
  }

  return rows.map((row) => {
    const record = { ...(row as unknown as Record<string, string>) }
    const permitNumber = record.permit_number
    const lookup = permitNumber ? permitLookups.get(permitNumber) : null

    if (lookup?.dba && !firstText(record.dba, record.business_name)) {
      record.dba = lookup.dba
    }

    if (lookup?.inspection_type && !firstText(record.inspection_type)) {
      record.inspection_type = lookup.inspection_type
    }

    if (lookup?.street_address_clean && !firstText(record.street_address_clean, record.street_address)) {
      record.street_address_clean = lookup.street_address_clean
      record.street_address = lookup.street_address_clean
    }

    return record as unknown as InspectionRaw
  })
}

function getInspectionDisplayName(
  row: Record<string, string>,
  fields: CityConfig['fields'],
  address: string | null,
  inspectionType: string | null
): string {
  const configured = fields.inspectionName ? row[fields.inspectionName] : undefined
  const fallbackName = firstText(
    configured,
    row['dba_name'],
    row['business_name'],
    row['opa_owner'],
    row['dba'],
    row['owner_name']
  )

  if (fallbackName && isGenericInspectionName(fallbackName)) {
    if (row['opa_owner']) return normalizeInspectionText(row['opa_owner']) ?? row['opa_owner']
    if (address) return address
  }

  if (fallbackName && inspectionType && normalizeInspectionText(fallbackName) === normalizeInspectionText(inspectionType) && address) {
    return address
  }

  if (fallbackName) return fallbackName
  if (address) return address
  if (inspectionType) return inspectionType
  return 'Inspection'
}

function getInspectionAddress(
  row: Record<string, string>,
  fields: CityConfig['fields']
): string | null {
  if (fields.inspectionAddress) {
    const value = row[fields.inspectionAddress]
    if (value) return normalizeInspectionText(value)
  }

  if (fields.inspectionAddressParts?.length) {
    const parts = fields.inspectionAddressParts
      .map((key) => row[key])
      .filter((value): value is string => Boolean(value))
      .map(normalizeInspectionText)
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }

  return firstText(
    row['street_address_clean'],
    row['street_address'],
    row['address']
  )
}

function getInspectionType(
  row: Record<string, string>,
  fields: CityConfig['fields']
): string | null {
  return firstText(
    fields.inspectionType ? row[fields.inspectionType] : undefined,
    row['inspection_type'],
    row['inspection'],
    row['permit_type']
  )
}

function getInspectionResult(
  row: Record<string, string>,
  fields: CityConfig['fields']
): string | null {
  const configuredResult = firstText(
    fields.inspectionResult ? row[fields.inspectionResult] : undefined,
    row['facility_rating_status'],
    row['inspection_result'],
    row['action'],
    row['status'],
    row['permit_status']
  )

  if (configuredResult) return configuredResult

  const violationCount = parseInt(row['violation_count'] ?? '', 10)
  if (!Number.isNaN(violationCount) && violationCount > 0) return 'Violations noted'

  return null
}

function getInspectionViolations(
  row: Record<string, string>,
  fields: CityConfig['fields']
): string | null {
  return firstText(
    fields.inspectionViolations ? row[fields.inspectionViolations] : undefined,
    row['inspection_notes'],
    row['violation_codes'],
    row['violation_description'],
    row['suspension_notes'],
    row['violations']
  )
}

function getInspectionRisk(
  row: Record<string, string>,
  fields: CityConfig['fields']
): string | null {
  return firstText(
    fields.inspectionRisk ? row[fields.inspectionRisk] : undefined,
    row['critical_flag'],
    row['casepriority'],
    row['risk']
  )
}

function classifyInspectionNotes(
  city: CityConfig,
  row: Record<string, string>,
  rawNotes: string | null
): { violations: string | null; details: string | null } {
  const noteEntries = splitInspectionEntries(rawNotes)
  const violationEntries = noteEntries.filter((entry) => isMeaningfulViolationEntry(entry))
  const metadataEntries = noteEntries.filter((entry) => isInspectionMetadataEntry(entry))

  if (city.key === 'philadelphia') {
    const details = joinInspectionEntries([
      firstText(row.casetype) ? `Case: ${firstText(row.casetype)}` : null,
      firstText(row.casepriority) ? `Priority: ${firstText(row.casepriority)}` : null,
    ])

    return {
      violations: joinInspectionEntries(violationEntries),
      details,
    }
  }

  return {
    violations: joinInspectionEntries(violationEntries),
    details: joinInspectionEntries(metadataEntries),
  }
}

async function fetchPhiladelphiaInspections(
  wardId: number,
  _city: CityConfig,
  days: number,
  view: DataView
): Promise<Inspection[]> {
  const sinceDate = new Date(daysAgo(days))
  const rows = ((await prisma.inspection.findMany({
    where: {
      cityKey: 'philadelphia',
      ward: wardId,
      inspectionDate: {
        gte: sinceDate,
      },
    },
    orderBy: [
      { inspectionDate: 'desc' },
      { createdAt: 'desc' },
    ],
    take: view === 'full' ? 2000 : 400,
  })) ?? []) as StoredPhiladelphiaInspectionRow[]

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return rows.map((row): Inspection => {
    const coordinates = normalizeInspectionCoordinates(row.latitude ?? null, row.longitude ?? null)
    const inspectionDate = row.inspectionDate ? row.inspectionDate.toISOString().slice(0, 10) : null
    const isFailed = isInspectionFailure(row.results)
    const isRecentFail = isFailed && row.inspectionDate ? row.inspectionDate > thirtyDaysAgo : false

    return {
      id: row.inspectionId,
      dbaName: row.dbaName,
      address: row.address ?? null,
      zip: row.zip ?? null,
      inspectionType: row.inspectionType ?? null,
      results: row.results ?? null,
      violations: row.violations ?? null,
      details: null,
      inspectionDate,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      ward: row.ward ?? wardId,
      riskLevel: null,
      isFailed,
      isRecentFail,
    }
  })
}

interface CharlotteInspectionSession {
  html: string
  cookieHeader: string
}

interface CharlotteInspectionRow {
  stateId: string
  name: string
  addressLine: string
  city: string
  zip: string | null
  fullAddress: string
  establishmentType: string
  score: number | null
  grade: string | null
  inspectorId: string | null
  inspectionDate: Date
  result: string
  latitude: number | null
  longitude: number | null
}

async function fetchCharlotteInspectionPage(url: string): Promise<CharlotteInspectionSession> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(30000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Charlotte inspection page ${res.status}`)
  }

  return {
    html: await res.text(),
    cookieHeader: getCookieHeader(res),
  }
}

async function postCharlotteInspectionPage(
  url: string,
  session: CharlotteInspectionSession,
  overrides: Record<string, string>
): Promise<CharlotteInspectionSession> {
  const form = {
    ...extractCharlotteFormValues(session.html),
    ...overrides,
    'ctl00$PageContent$PREMISE_CITYFilter': overrides['ctl00$PageContent$PREMISE_CITYFilter']
      ?? extractCharlotteFormValues(session.html)['ctl00$PageContent$PREMISE_CITYFilter']
      ?? 'CHARLOTTE',
    'ctl00$PageContent$Pagination$_PageSize': overrides['ctl00$PageContent$Pagination$_PageSize']
      ?? extractCharlotteFormValues(session.html)['ctl00$PageContent$Pagination$_PageSize']
      ?? '50',
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CityPulse/1.0',
      Cookie: session.cookieHeader,
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(30000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Charlotte inspection postback ${res.status}`)
  }

  return {
    html: await res.text(),
    cookieHeader: mergeCookieHeaders(session.cookieHeader, getCookieHeader(res)),
  }
}

function extractCharlotteFormValues(html: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const match of Array.from(html.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/gi))) {
    const tag = match[0]
    const name = decodeHtml(match[1] ?? '')
    const valueMatch = tag.match(/value="([^"]*)"/i)
    values[name] = decodeHtml(valueMatch?.[1] ?? '')
  }

  for (const match of Array.from(html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi))) {
    const name = decodeHtml(match[1] ?? '')
    const body = match[2] ?? ''
    const selected =
      body.match(/<option\b[^>]*selected="selected"[^>]*value="([^"]*)"/i)?.[1]
      ?? body.match(/<option\b[^>]*value="([^"]*)"/i)?.[1]
      ?? ''
    values[name] = decodeHtml(selected)
  }

  return values
}

function getCharlotteTotalPages(html: string): number {
  const match = html.match(/id="ctl00_PageContent_Pagination__TotalPages"[^>]*>([\d,]+)/i)
  return match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : 1
}

function parseCharlotteInspectionRows(html: string): CharlotteInspectionRow[] {
  const tableMatch = html.match(/<table[^>]*id="VW_PUBLIC_ESTINSPTableControlGrid"[\s\S]*?<\/table>/i)
  if (!tableMatch) return []

  const rows: CharlotteInspectionRow[] = []

  for (const rowMatch of Array.from(tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const rowHtml = rowMatch[1]
    const cells = Array.from(String(rowHtml).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1])
    if (cells.length < 10) continue

    const inspectionDate = parseCharlotteInspectionDate(cleanCharlotteText(cells[1]))
    if (!inspectionDate) continue

    const address = parseCharlotteAddress(cells[3])
    rows.push({
      stateId: cleanCharlotteText(cells[4]) ?? 'Unknown',
      name: cleanCharlotteText(cells[2]) ?? 'Inspection',
      addressLine: address.streetAddress,
      city: address.city,
      zip: address.zip,
      fullAddress: address.fullAddress,
      establishmentType: cleanCharlotteText(cells[5]) ?? 'Public health inspection',
      score: parseCharlotteNumber(cleanCharlotteText(cells[6])),
      grade: cleanCharlotteText(cells[7]),
      inspectorId: cleanCharlotteText(cells[8]),
      inspectionDate,
      result: parseCharlotteInspectionResult(cleanCharlotteText(cells[7]), parseCharlotteNumber(cleanCharlotteText(cells[6]))),
      latitude: null,
      longitude: null,
    })
  }

  return rows
}

function parseCharlotteInspectionDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseCharlotteAddress(html: string): { streetAddress: string; city: string; zip: string | null; fullAddress: string } {
  const text = cleanCharlotteText(html, '\n') ?? ''
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const streetAddress = lines[0] ?? 'Address unavailable'
  const locality = lines[1] ?? ''
  const localityMatch = locality.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/i)
  const city = localityMatch?.[1]?.trim() ?? ''
  const state = localityMatch?.[2]?.trim() ?? 'NC'
  const zip = localityMatch?.[3] ?? null
  const fullAddress = [streetAddress, [city, state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  return {
    streetAddress,
    city,
    zip,
    fullAddress,
  }
}

function parseCharlotteInspectionResult(grade: string | null, score: number | null): string {
  const normalizedGrade = grade?.toUpperCase()

  if (normalizedGrade === 'A') return 'Pass'
  if (normalizedGrade === 'B') return 'Needs attention'
  if (normalizedGrade === 'C') return 'Fail'
  if (score !== null && score >= 90) return 'Pass'
  if (score !== null && score >= 70) return 'Needs attention'
  if (score !== null) return 'Fail'
  return 'Completed'
}

function parseCharlotteNumber(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/,/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

async function geocodeCharlotteInspectionRows(
  rows: CharlotteInspectionRow[],
  city: CityConfig
): Promise<CharlotteInspectionRow[]> {
  const uniqueAddresses = Array.from(new Set(rows.map((row) => row.fullAddress)))
  const geocoded = new Map<string, { lat: number; lng: number } | null>()

  for (let index = 0; index < uniqueAddresses.length; index += 8) {
    const batch = uniqueAddresses.slice(index, index + 8)
    const results = await Promise.all(batch.map((address) => geocodeCharlotteInspectionAddress(address, city)))

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      geocoded.set(batch[batchIndex], results[batchIndex] ?? null)
    }
  }

  return rows.map((row) => {
    const coords = geocoded.get(row.fullAddress) ?? null
    return {
      ...row,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    }
  })
}

async function geocodeCharlotteInspectionAddress(
  address: string,
  city: CityConfig
): Promise<{ lat: number; lng: number } | null> {
  if (!city.geocoderSource) return null

  const url = new URL('findAddressCandidates', ensureTrailingSlash(city.geocoderSource.url))
  url.searchParams.set('singleLine', address)
  url.searchParams.set('outFields', '*')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('f', 'json')
  url.searchParams.set('maxLocations', '1')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 0 },
  })
  if (!res.ok) return null

  const data = await res.json() as { candidates?: Array<{ score?: number; location?: { x: number; y: number } }> }
  const candidate = data.candidates?.find((item) => (item.score ?? 0) >= (city.geocoderSource?.minScore ?? 80))
  if (!candidate?.location) return null

  return {
    lat: candidate.location.y,
    lng: candidate.location.x,
  }
}

function getCookieHeader(res: Response): string {
  const getSetCookie = 'getSetCookie' in res.headers && typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : []

  return getSetCookie
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ')
}

function mergeCookieHeaders(current: string, next: string): string {
  const cookies = new Map<string, string>()

  for (const source of [current, next]) {
    for (const part of source.split(/;\s*/)) {
      const [name, value] = part.split('=', 2)
      if (!name || value === undefined) continue
      cookies.set(name, `${name}=${value}`)
    }
  }

  return Array.from(cookies.values()).join('; ')
}

function buildDistrictMatch(
  wardId: number,
  city: CityConfig,
  districtCol: string,
  numericOverride?: boolean,
  padOverride?: number
): string {
  const districtLabel = city.districtLabels?.[wardId]
  if (districtLabel) {
    return `${districtCol}='${escapeSqlString(districtLabel)}'`
  }

  const numeric = numericOverride ?? city.districtNumeric ?? false
  const pad = padOverride ?? city.districtPad
  const districtVal = pad ? String(wardId).padStart(pad, '0') : String(wardId)
  return numeric ? `${districtCol}=${wardId}` : `${districtCol}='${escapeSqlString(districtVal)}'`
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

function getInspectionCoordinates(
  row: Record<string, unknown>,
  fields: CityConfig['fields']
): { lat: number; lng: number } | null {
  const latKey = fields.inspectionLat ?? 'latitude'
  const lngKey = fields.inspectionLng ?? 'longitude'
  const locationKey = fields.inspectionLocation ?? 'location'

  const latVal = row[latKey]
  const lngVal = row[lngKey]
  if (latVal !== undefined && lngVal !== undefined && latVal !== null && lngVal !== null) {
    return { lat: Number(latVal), lng: Number(lngVal) }
  }

  const location = row[locationKey]
  if (
    location &&
    typeof location === 'object' &&
    'latitude' in location &&
    'longitude' in location
  ) {
    return {
      lat: Number((location as { latitude: string | number }).latitude),
      lng: Number((location as { longitude: string | number }).longitude),
    }
  }

  return null
}

function isInspectionFailure(result: string | null | undefined): boolean {
  if (!result) return false

  const normalized = result.toLowerCase()
  return (
    result === 'B' ||
    result === 'C' ||
    normalized.includes('fail') ||
    normalized.includes('correction') ||
    normalized.includes('denied') ||
    normalized.includes('not ready')
  )
}

function groupNewYorkCityInspections(inspections: Inspection[]): Inspection[] {
  const grouped = new Map<string, Inspection>()

  for (const inspection of inspections) {
    const key = [
      inspection.id,
      inspection.dbaName,
      inspection.address,
      inspection.inspectionDate,
      inspection.inspectionType,
      inspection.results,
    ].join('::')
    const existing = grouped.get(key)

    if (!existing) {
      grouped.set(key, { ...inspection })
      continue
    }

    existing.violations = joinInspectionValues(existing.violations, inspection.violations)
    existing.details = joinInspectionValues(existing.details, inspection.details)
    existing.riskLevel = combineRiskLevels(existing.riskLevel, inspection.riskLevel)
    existing.isFailed = existing.isFailed || inspection.isFailed
    existing.isRecentFail = existing.isRecentFail || inspection.isRecentFail
  }

  return Array.from(grouped.values())
}

function joinInspectionValues(current: string | null, next: string | null): string | null {
  const values = new Set<string>()

  for (const value of [current, next]) {
    if (!value) continue
    for (const part of splitInspectionEntries(value)) {
      values.add(part)
    }
  }

  return values.size > 0 ? Array.from(values).join(' | ') : null
}

function splitInspectionEntries(value: string | null): string[] {
  if (!value) return []
  return value
    .split('|')
    .map((entry) => normalizeInspectionText(entry))
    .filter(Boolean) as string[]
}

function joinInspectionEntries(values: Array<string | null | undefined>): string | null {
  const entries = Array.from(
    new Set(
      values
        .map((value) => normalizeInspectionText(value))
        .filter(Boolean) as string[]
    )
  )

  return entries.length > 0 ? entries.join(' | ') : null
}

function isInspectionMetadataEntry(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith('state id:') ||
    normalized.startsWith('score:') ||
    normalized.startsWith('grade:') ||
    normalized.startsWith('inspector:') ||
    normalized.startsWith('stop:')
  )
}

function isMeaningfulViolationEntry(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (isInspectionMetadataEntry(value)) return false

  return !(
    normalized === 'notice of violation' ||
    normalized.startsWith('notice of violation') ||
    normalized.startsWith('site violation notice') ||
    normalized === 'administrative notice of violation' ||
    normalized === 'standard' ||
    normalized === 'unsafe' ||
    normalized === 'hazardous' ||
    normalized === 'violations noted' ||
    normalized === 'violations were cited in the following area(s).' ||
    normalized === 'completed'
  )
}

function combineRiskLevels(current: string | null, next: string | null): string | null {
  if (normalizeInspectionText(current) === 'Critical' || normalizeInspectionText(next) === 'Critical') {
    return 'Critical'
  }

  return current ?? next
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeInspectionText(value)
    if (normalized) return normalized
  }

  return null
}

function normalizeInspectionText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function isGenericInspectionName(value: string): boolean {
  const normalized = value.trim().toUpperCase()
  return (
    normalized === 'NOTICE OF VIOLATION' ||
    normalized === 'CASE INVESTIGATION' ||
    normalized === 'L&I CASE INVESTIGATION'
  )
}

function cleanCharlotteText(value: string | undefined | null, lineBreak = ' '): string | null {
  if (!value) return null

  const normalized = decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, lineBreak)
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  return normalized || null
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function uniqueFields(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}
