import { loadEnvConfig } from '@next/env'
import { getCity } from '@/config/cities'

const CHARLOTTE_BASE_URL =
  'https://public.cdpehs.com/NCENVPBL/ESTABLISHMENT/ShowESTABLISHMENTTablePage.aspx?ESTTST_CTY=60'
const DEFAULT_DAY_COUNT = 90
const PAGE_SIZE = 50
const DEFAULT_REMOTE_REQUEST_DELAY_MS = 500
const DEFAULT_GEOCODE_DELAY_MS = 250
const MAX_FETCH_ATTEMPTS = 5
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

interface CliOptions {
  date?: string
  from?: string
  to?: string
  days: number
  limit?: number
  dryRun: boolean
  refreshExisting: boolean
  remoteDelayMs: number
  geocodeDelayMs: number
}

interface CharlotteListSession {
  html: string
  cookieHeader: string
}

interface CharlotteInspectionSummary {
  violationEventTarget: string
  inspectionDate: Date
  inspectionDateIso: string
  dbaName: string
  addressLine: string
  city: string
  zip: string | null
  fullAddress: string
  licenseNo: string | null
  inspectionType: string | null
  score: number | null
  grade: string | null
  inspectorId: string | null
}

interface CharlotteInspectionDetail {
  inspectionId: string
  dbaName: string
  addressLine: string | null
  cityStateZip: string | null
  inspectionType: string | null
  generalComments: string | null
  violationComments: string[]
  inspectionDate: string | null
  licenseNo: string | null
  score: number | null
  grade: string | null
}

interface StoredInspectionRecord {
  inspectionId: string
  dbaName: string
  licenseNo: string | null
  address: string | null
  zip: string | null
  inspectionType: string | null
  results: string | null
  violations: string | null
  inspectionDate: Date | null
  latitude: number | null
  longitude: number | null
  ward: number | null
}

interface GeocodeHit {
  ward: number | null
  latitude: number | null
  longitude: number | null
}

interface BackfillStats {
  dates: number
  rowsDiscovered: number
  detailsFetched: number
  processed: number
  insertedOrUpdated: number
  skippedExisting: number
  geocoded: number
  geocodeMisses: number
  failures: Array<{ date: string; inspectionId?: string; error: string }>
}

const CHARLOTTE = getCity('charlotte')

let prisma: typeof import('@/lib/prisma').prisma
let invalidateCache: typeof import('@/lib/cache').invalidateCache
let geocodeAddress: typeof import('@/services/geocoder').geocodeAddress

async function main() {
  loadEnvConfig(process.cwd())

  ;({ prisma } = await import('@/lib/prisma'))
  ;({ invalidateCache } = await import('@/lib/cache'))
  ;({ geocodeAddress } = await import('@/services/geocoder'))

  const options = parseArgs(process.argv.slice(2))

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const dates = buildDateRange(options)
  const rangeStartIso = dates[0]
  const rangeEndIso = dates[dates.length - 1]
  const geocodeCache = new Map<string, GeocodeHit>()
  const stats: BackfillStats = {
    dates: dates.length,
    rowsDiscovered: 0,
    detailsFetched: 0,
    processed: 0,
    insertedOrUpdated: 0,
    skippedExisting: 0,
    geocoded: 0,
    geocodeMisses: 0,
    failures: [],
  }

  let nextRemoteRequestAt = 0
  let nextGeocodeAt = 0
  let processedCount = 0

  console.log(
    `[charlotte-inspections] scanning ${rangeStartIso}${rangeStartIso === rangeEndIso ? '' : ` through ${rangeEndIso}`}`
  )

  const rangeStartSearchDate = formatSearchDate(rangeStartIso)
  const rangeEndSearchDate = formatSearchDate(rangeEndIso)

  nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
  let session = await fetchCharlotteInspectionPage(CHARLOTTE_BASE_URL)
  nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
  session = await postCharlotteInspectionPage(CHARLOTTE_BASE_URL, session, {
    'ctl00$PageContent$PREMISE_CITYFilter': 'CHARLOTTE',
    'ctl00$PageContent$INSPECTION_DATEFromFilter': rangeStartSearchDate,
    'ctl00$PageContent$INSPECTION_DATEToFilter': rangeEndSearchDate,
    __EVENTTARGET: 'ctl00$PageContent$FilterButton$_Button',
    __EVENTARGUMENT: '',
  })
  nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
  session = await postCharlotteInspectionPage(CHARLOTTE_BASE_URL, session, {
    'ctl00$PageContent$PREMISE_CITYFilter': 'CHARLOTTE',
    'ctl00$PageContent$INSPECTION_DATEFromFilter': rangeStartSearchDate,
    'ctl00$PageContent$INSPECTION_DATEToFilter': rangeEndSearchDate,
    'ctl00$PageContent$Pagination$_PageSize': String(PAGE_SIZE),
    __EVENTTARGET: 'ctl00$PageContent$Pagination$_PageSizeButton',
    __EVENTARGUMENT: '',
  })

  const totalPages = getCharlotteTotalPages(session.html)

  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    if (options.limit && processedCount >= options.limit) break

    const rows = parseCharlotteInspectionRows(session.html)

    for (const row of rows) {
      if (options.limit && processedCount >= options.limit) break

      stats.rowsDiscovered += 1

      try {
        nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
        const detailResponse = await fetchCharlotteViolationDetailPage(
          CHARLOTTE_BASE_URL,
          session,
          row.violationEventTarget
        )
        const detail = parseCharlotteInspectionDetail(detailResponse.html, detailResponse.url, row)
        stats.detailsFetched += 1
        processedCount += 1
        console.log(
          `[charlotte-inspections] parsed ${detail.inspectionId} · ${detail.dbaName} · ${row.inspectionDateIso}`
        )

        const existing = !options.refreshExisting
          ? await prisma.inspection.findFirst({
              where: {
                cityKey: CHARLOTTE.key,
                inspectionId: detail.inspectionId,
              },
              select: { id: true },
            })
          : null

        if (existing) {
          stats.skippedExisting += 1
          console.log(`[charlotte-inspections] skipped existing ${detail.inspectionId}`)
          continue
        }

        const normalized = await normalizeDetail(
          detail,
          geocodeCache,
          stats,
          async () => {
            nextGeocodeAt = await sleepUntil(nextGeocodeAt, options.geocodeDelayMs)
          }
        )

        stats.processed += 1

        if (!options.dryRun) {
          await prisma.inspection.upsert({
            where: {
              cityKey_inspectionId: {
                cityKey: CHARLOTTE.key,
                inspectionId: normalized.inspectionId,
              },
            },
            update: {
              dbaName: normalized.dbaName,
              licenseNo: normalized.licenseNo,
              address: normalized.address,
              zip: normalized.zip,
              inspectionType: normalized.inspectionType,
              results: normalized.results,
              violations: normalized.violations,
              inspectionDate: normalized.inspectionDate,
              latitude: normalized.latitude,
              longitude: normalized.longitude,
              ward: normalized.ward,
            },
            create: {
              cityKey: CHARLOTTE.key,
              inspectionId: normalized.inspectionId,
              dbaName: normalized.dbaName,
              licenseNo: normalized.licenseNo,
              address: normalized.address,
              zip: normalized.zip,
              inspectionType: normalized.inspectionType,
              results: normalized.results,
              violations: normalized.violations,
              inspectionDate: normalized.inspectionDate,
              latitude: normalized.latitude,
              longitude: normalized.longitude,
              ward: normalized.ward,
            },
          })
          console.log(
            `[charlotte-inspections] upserted ${normalized.inspectionId} → ward ${normalized.ward ?? 'unknown'}`
          )
        } else {
          console.log(`[charlotte-inspections] dry run complete for ${normalized.inspectionId}`)
        }

        stats.insertedOrUpdated += 1
      } catch (error) {
        stats.failures.push({
          date: row.inspectionDateIso,
          error: toErrorMessage(error),
        })
        console.error(`[charlotte-inspections] ${row.inspectionDateIso}: ${toErrorMessage(error)}`)
      }
    }

    if ((options.limit && processedCount >= options.limit) || pageIndex >= totalPages) {
      break
    }

    nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
    session = await postCharlotteInspectionPage(CHARLOTTE_BASE_URL, session, {
      __EVENTTARGET: 'ctl00$PageContent$Pagination$_NextPage',
      __EVENTARGUMENT: '',
    })
  }

  if (!options.dryRun) {
    await invalidateCache(`${CHARLOTTE.key}:inspections:`)
  }

  console.log(
    JSON.stringify(
      {
        options,
        stats,
      },
      null,
      2
    )
  )

  if (stats.failures.length > 0) {
    process.exitCode = 1
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    days: DEFAULT_DAY_COUNT,
    dryRun: false,
    refreshExisting: false,
    remoteDelayMs: DEFAULT_REMOTE_REQUEST_DELAY_MS,
    geocodeDelayMs: DEFAULT_GEOCODE_DELAY_MS,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const next = args[i + 1]

    if (arg === '--date' && next) {
      options.date = next
      i += 1
      continue
    }

    if (arg === '--from' && next) {
      options.from = next
      i += 1
      continue
    }

    if (arg === '--to' && next) {
      options.to = next
      i += 1
      continue
    }

    if (arg === '--days' && next) {
      options.days = parseInt(next, 10)
      i += 1
      continue
    }

    if (arg === '--limit' && next) {
      options.limit = parseInt(next, 10)
      i += 1
      continue
    }

    if (arg === '--remote-delay-ms' && next) {
      options.remoteDelayMs = parseInt(next, 10)
      i += 1
      continue
    }

    if (arg === '--geocode-delay-ms' && next) {
      options.geocodeDelayMs = parseInt(next, 10)
      i += 1
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--refresh-existing') {
      options.refreshExisting = true
    }
  }

  return options
}

function buildDateRange(options: CliOptions): string[] {
  if (options.date) {
    return [normalizeIsoDate(options.date)]
  }

  if (options.from || options.to) {
    if (!options.from || !options.to) {
      throw new Error('Both --from and --to are required together')
    }

    const from = parseIsoDate(options.from)
    const to = parseIsoDate(options.to)
    if (from.getTime() > to.getTime()) {
      throw new Error('--from must be on or before --to')
    }

    const dates: string[] = []
    const current = new Date(from)
    while (current.getTime() <= to.getTime()) {
      dates.push(formatIsoDate(current))
      current.setUTCDate(current.getUTCDate() + 1)
    }
    return dates
  }

  const end = startOfUtcDay(new Date())
  const dates: string[] = []
  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    const current = new Date(end)
    current.setUTCDate(current.getUTCDate() - offset)
    dates.push(formatIsoDate(current))
  }
  return dates
}

async function fetchCharlotteInspectionPage(url: string): Promise<CharlotteListSession> {
  const res = await fetchWithRetry(url)
  return {
    html: await decodeResponseHtml(res),
    cookieHeader: getCookieHeader(res),
  }
}

async function postCharlotteInspectionPage(
  url: string,
  session: CharlotteListSession,
  overrides: Record<string, string>
): Promise<CharlotteListSession> {
  const form = {
    ...extractCharlotteFormValues(session.html),
    ...overrides,
    'ctl00$PageContent$PREMISE_CITYFilter':
      overrides['ctl00$PageContent$PREMISE_CITYFilter']
      ?? extractCharlotteFormValues(session.html)['ctl00$PageContent$PREMISE_CITYFilter']
      ?? 'CHARLOTTE',
    'ctl00$PageContent$Pagination$_PageSize':
      overrides['ctl00$PageContent$Pagination$_PageSize']
      ?? extractCharlotteFormValues(session.html)['ctl00$PageContent$Pagination$_PageSize']
      ?? String(PAGE_SIZE),
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: session.cookieHeader,
    },
    body: new URLSearchParams(form).toString(),
  })

  return {
    html: await decodeResponseHtml(res),
    cookieHeader: mergeCookieHeaders(session.cookieHeader, getCookieHeader(res)),
  }
}

async function fetchCharlotteViolationDetailPage(
  url: string,
  session: CharlotteListSession,
  eventTarget: string
): Promise<{ html: string; url: string }> {
  const form = {
    ...extractCharlotteFormValues(session.html),
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: '',
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: session.cookieHeader,
    },
    body: new URLSearchParams(form).toString(),
    redirect: 'follow',
  })

  return {
    html: await decodeResponseHtml(res),
    url: res.url,
  }
}

function extractCharlotteFormValues(html: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const match of Array.from(html.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/gi))) {
    const tag = match[0]
    const name = decodeHtmlEntities(match[1] ?? '')
    const valueMatch = tag.match(/value="([^"]*)"/i)
    values[name] = decodeHtmlEntities(valueMatch?.[1] ?? '')
  }

  for (const match of Array.from(html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi))) {
    const name = decodeHtmlEntities(match[1] ?? '')
    const body = match[2] ?? ''
    const selected =
      body.match(/<option\b[^>]*selected="selected"[^>]*value="([^"]*)"/i)?.[1]
      ?? body.match(/<option\b[^>]*value="([^"]*)"/i)?.[1]
      ?? ''
    values[name] = decodeHtmlEntities(selected)
  }

  return values
}

function getCharlotteTotalPages(html: string): number {
  const match = html.match(/id="ctl00_PageContent_Pagination__TotalPages"[^>]*>([\d,]+)/i)
  return match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : 1
}

function parseCharlotteInspectionRows(html: string): CharlotteInspectionSummary[] {
  const tableMatch = html.match(/<table[^>]*id="VW_PUBLIC_ESTINSPTableControlGrid"[\s\S]*?<\/table>/i)
  if (!tableMatch) return []

  const rows: CharlotteInspectionSummary[] = []

  for (const rowMatch of Array.from(tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const rowHtml = rowMatch[1] ?? ''
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1] ?? '')
    if (cells.length < 10) continue

    const eventTargetMatch = decodeHtmlEntities(cells[0]).match(/__doPostBack\('([^']+\$ViolationDetails)'/i)
    const inspectionDate = parseCharlotteInspectionDate(cleanHtmlText(cells[1]))
    if (!eventTargetMatch?.[1] || !inspectionDate) continue

    const address = parseCharlotteAddress(cells[3])

    rows.push({
      violationEventTarget: decodeHtmlEntities(eventTargetMatch[1]),
      inspectionDate,
      inspectionDateIso: formatIsoDate(inspectionDate),
      dbaName: cleanHtmlText(cells[2]) || 'Charlotte Inspection',
      addressLine: address.streetAddress,
      city: address.city,
      zip: address.zip,
      fullAddress: address.fullAddress,
      licenseNo: cleanHtmlText(cells[4]) || null,
      inspectionType: cleanHtmlText(cells[5]) || null,
      score: parseNumber(cleanHtmlText(cells[6])),
      grade: cleanHtmlText(cells[7]) || null,
      inspectorId: cleanHtmlText(cells[8]) || null,
    })
  }

  return rows
}

function parseCharlotteInspectionDetail(
  html: string,
  detailUrl: string,
  summary: CharlotteInspectionSummary
): CharlotteInspectionDetail {
  const info = new Map<string, string>()

  for (const rowMatch of Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const rowHtml = rowMatch[1] ?? ''
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1] ?? '')

    if (cells.length === 2) {
      const label = cleanHtmlText(cells[0]).replace(/:$/, '')
      const value = cleanHtmlText(cells[1])
      if (label && value) {
        info.set(label, value)
      }
    }
  }

  const violationComments: string[] = []

  for (const rowMatch of Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const rowHtml = rowMatch[1] ?? ''
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1] ?? '')
    if (cells.length < 7) continue

    const item = cleanHtmlText(cells[0])
    if (!/^\d+$/.test(item)) continue

    const description = cleanHtmlText(cells[2])
    const comments = cleanHtmlText(cells[6])
    const body = firstNonEmpty(comments, description)
    if (!body) continue

    violationComments.push(`Item ${item}: ${body}`)
  }

  const detail = new URL(detailUrl)

  return {
    inspectionId: detail.searchParams.get('INSPECTION') ?? summary.licenseNo ?? `${summary.dbaName}-${summary.inspectionDateIso}`,
    dbaName: firstNonEmpty(info.get('Name') ?? null, summary.dbaName) ?? 'Charlotte Inspection',
    addressLine: firstNonEmpty(info.get('Address') ?? null, summary.addressLine),
    cityStateZip: info.get('City/State/ZIP') ?? null,
    inspectionType: firstNonEmpty(info.get('Premise Type') ?? null, summary.inspectionType),
    generalComments: info.get('General Comments') ?? null,
    violationComments,
    inspectionDate: firstNonEmpty(info.get('Inspection Date') ?? null, summary.inspectionDateIso),
    licenseNo: firstNonEmpty(summary.licenseNo, null),
    score: summary.score,
    grade: summary.grade,
  }
}

async function normalizeDetail(
  detail: CharlotteInspectionDetail,
  geocodeCache: Map<string, GeocodeHit>,
  stats: BackfillStats,
  beforeGeocode: () => Promise<void>
): Promise<StoredInspectionRecord> {
  const address = normalizeStreetAddress(detail.addressLine)
  const zip = extractZip(detail.cityStateZip, detail.addressLine)
  const dateText = normalizeDetailDate(detail.inspectionDate)
  const inspectionDate = dateText ? parseStoredDate(dateText) : null
  const violations = joinCharlotteViolations(detail.violationComments, detail.generalComments)
  const results = deriveCharlotteResult(detail.grade, detail.score, detail.violationComments.length)

  let coordinates: GeocodeHit = {
    ward: null,
    latitude: null,
    longitude: null,
  }

  if (address) {
    const geocodeInput = detail.cityStateZip
      ? `${address}, ${detail.cityStateZip}`
      : zip
        ? `${address} ${zip}`
        : address
    const cacheKey = geocodeInput.toUpperCase()
    const cached = geocodeCache.get(cacheKey)
    if (cached) {
      coordinates = cached
    } else {
      await beforeGeocode()
      const geocoded = await geocodeAddress(geocodeInput, CHARLOTTE.key)
      coordinates = {
        ward: geocoded?.ward ?? null,
        latitude: geocoded?.lat ?? null,
        longitude: geocoded?.lng ?? null,
      }
      geocodeCache.set(cacheKey, coordinates)

      if (geocoded) {
        stats.geocoded += 1
      } else {
        stats.geocodeMisses += 1
      }
    }
  }

  return {
    inspectionId: detail.inspectionId,
    dbaName: detail.dbaName,
    licenseNo: detail.licenseNo,
    address,
    zip,
    inspectionType: detail.inspectionType,
    results,
    violations,
    inspectionDate,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ward: coordinates.ward,
  }
}

function parseCharlotteInspectionDate(value: string | null): Date | null {
  if (!value) return null
  const normalized = normalizeDetailDate(value)
  return normalized ? parseIsoDate(normalized) : null
}

function normalizeDetailDate(value: string | null): string | null {
  if (!value) return null

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  return null
}

function parseCharlotteAddress(html: string): {
  streetAddress: string
  city: string
  zip: string | null
  fullAddress: string
} {
  const text = cleanHtmlText(html).replace(/\s{2,}/g, ' ').trim()
  const charlotteMatch = text.match(/^(.*?)\s+(CHARLOTTE),\s*([A-Z]{2})\s*(\d{5})?$/i)
  if (charlotteMatch) {
    const [, streetAddress, city, state, zip] = charlotteMatch
    const locality = [city.trim(), state.trim(), zip ?? ''].filter(Boolean).join(' ')
    return {
      streetAddress: streetAddress.trim(),
      city: city.trim(),
      zip: zip ?? null,
      fullAddress: [streetAddress.trim(), locality].filter(Boolean).join(', '),
    }
  }

  const fallbackMatch = text.match(/^(.*?),\s*([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s*(\d{5})?$/i)
  if (!fallbackMatch) {
    return {
      streetAddress: text || 'Address unavailable',
      city: '',
      zip: extractZip(text),
      fullAddress: text || 'Address unavailable',
    }
  }

  const [, streetAddress, city, state, zip] = fallbackMatch
  const locality = [city.trim(), state.trim(), zip ?? ''].filter(Boolean).join(' ')
  return {
    streetAddress: streetAddress.trim(),
    city: city.trim(),
    zip: zip ?? null,
    fullAddress: [streetAddress.trim(), locality].filter(Boolean).join(', '),
  }
}

function parseNumber(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/,/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function deriveCharlotteResult(grade: string | null, score: number | null, violationCount: number): string {
  const normalizedGrade = grade?.toUpperCase()

  if (normalizedGrade === 'A') return 'Pass'
  if (normalizedGrade === 'B') return 'Needs attention'
  if (normalizedGrade === 'C') return 'Fail'
  if (score !== null && normalizedGrade && normalizedGrade !== 'N/A') {
    if (score >= 90) return 'Pass'
    if (score >= 70) return 'Needs attention'
    return 'Fail'
  }
  if (violationCount > 0) return 'Violations noted'
  return 'Completed'
}

function joinCharlotteViolations(violationComments: string[], generalComments: string | null): string | null {
  const unique = Array.from(new Set(violationComments.map((item) => item.trim()).filter(Boolean)))
  if (generalComments?.trim()) {
    unique.push(`General comments: ${generalComments.trim()}`)
  }

  return unique.length > 0 ? unique.join(' | ') : null
}

async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(input, {
        ...init,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        const error = new Error(`Request failed (${res.status}) for ${input}`)
        if (attempt < MAX_FETCH_ATTEMPTS && RETRYABLE_STATUS_CODES.has(res.status)) {
          const waitMs = getRetryDelayMs(attempt, res.headers.get('retry-after'))
          console.warn(
            `[charlotte-inspections] retrying ${input} after ${waitMs}ms (${res.status}, attempt ${attempt}/${MAX_FETCH_ATTEMPTS})`
          )
          await sleep(waitMs)
          lastError = error
          continue
        }

        throw error
      }

      return res
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_FETCH_ATTEMPTS && isRetryableFetchError(normalized)) {
        const waitMs = getRetryDelayMs(attempt)
        console.warn(
          `[charlotte-inspections] retrying ${input} after ${waitMs}ms (${normalized.message}, attempt ${attempt}/${MAX_FETCH_ATTEMPTS})`
        )
        await sleep(waitMs)
        lastError = normalized
        continue
      }

      throw normalized
    }
  }

  throw lastError ?? new Error(`Request failed for ${input}`)
}

async function decodeResponseHtml(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer()
  return new TextDecoder('latin1').decode(buffer)
}

function getCookieHeader(res: Response): string {
  const headerBag = res.headers as Headers & { getSetCookie?: () => string[] }
  const getSetCookie = typeof headerBag.getSetCookie === 'function'
    ? headerBag.getSetCookie()
    : splitSetCookieHeader(res.headers.get('set-cookie'))

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

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) return []
  return value.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g).map((part) => part.trim()).filter(Boolean)
}

function cleanHtmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;/gi, '-')
}

function normalizeStreetAddress(value: string | null): string | null {
  if (!value) return null
  const text = value.replace(/\b\d{5}(?:-\d{4})?\b$/, '').replace(/\s+/g, ' ').trim()
  return text || null
}

function extractZip(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const match = value?.match(/\b(\d{5})(?:-\d{4})?\b/)
    if (match?.[1]) return match[1]
  }

  return null
}

function parseStoredDate(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10))
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function formatSearchDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${month}/${day}/${year}`
}

function normalizeIsoDate(value: string): string {
  return formatIsoDate(parseIsoDate(value))
}

function parseIsoDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const [, year, month, day] = match
  return new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)))
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

async function sleepUntil(nextAt: number, delayMs: number): Promise<number> {
  const now = Date.now()
  if (nextAt > now) {
    await sleep(nextAt - now)
  }
  return Date.now() + delayMs
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Number.NaN
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000
  }

  const base = 3000 * attempt
  const jitter = Math.floor(Math.random() * 1000)
  return base + jitter
}

function isRetryableFetchError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes('request failed') ||
    message.includes('fetch failed') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  )
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return null
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

main().catch((error) => {
  console.error('[charlotte-inspections-backfill]', error)
  process.exitCode = 1
})
