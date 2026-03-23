import { loadEnvConfig } from '@next/env'
import { getCity } from '@/config/cities'

const PHILLY_BASE_URL = 'https://philadelphia-pa.healthinspections.us/philadelphia/'
const SEARCH_PATH = 'search.cfm'
const DEFAULT_DAY_COUNT = 90
const SEARCH_PAGE_SIZE = 20
const DEFAULT_REMOTE_REQUEST_DELAY_MS = 3000
const DEFAULT_GEOCODE_DELAY_MS = 1100
const MAX_FETCH_ATTEMPTS = 6
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

interface FacilityReportSummary {
  facilityId: string
  inspectionId: string
  dbaName: string
  addressLine1: string
  addressLine2: string
  inspectionDate: string
  violationSummaries: string[]
  inspectionPageUrl: string
  searchPageUrl: string
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

interface PhillySession {
  cookies: Map<string, string>
}

interface BackfillStats {
  dates: number
  facilitiesDiscovered: number
  reportsDiscovered: number
  processed: number
  insertedOrUpdated: number
  skippedExisting: number
  geocoded: number
  geocodeMisses: number
  failures: Array<{ date: string; inspectionId?: string; facilityId?: string; error: string }>
}

const PHILADELPHIA = getCity('philadelphia')

let prisma: typeof import('@/lib/prisma').prisma
let invalidateCache: typeof import('@/lib/cache').invalidateCache
let geocodeAddress: typeof import('@/services/geocoder').geocodeAddress

const REPORT_BLOCK_RE =
  /<div style="border:1px solid #003399;width:95%;margin-bottom:10px;">\s*<div style="background-color:#003366;color:#FFFFFF;padding-left:5px;"><b>(.*?)<\/b><\/div>\s*<div style="background-color:#EFEFEF;padding-left:5px;">\s*(.*?)\s*<br \/>\s*(.*?)\s*<\/div>\s*<div style="padding:5px;">\s*<b>Inspection Date:<\/b>\s*([^<]+?)\s*<br \/>\s*<br \/>\s*<\/div>([\s\S]*?)<a href="(\.\.\/_templates\/551\/RetailFood\/_report_full\.cfm\?inspectionID=[^"]+)"/gi
const SEARCH_RESULT_RE =
  /<a href="estab\.cfm\?facilityID=([A-Z0-9-]+)"><b>(.*?)<\/b><\/a>\s*<div style="margin-bottom:10px;">\s*(.*?)\s*<br \/>\s*(.*?)\s*<div style="color:green;">\s*Last Inspection Date:\s*<a href="(estab\.cfm\?facilityID=[A-Z0-9-]+&inspectionID=([A-Z0-9-]+)&inspType=Food)">([^<]+)<\/a>/gi

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
  const geocodeCache = new Map<string, GeocodeHit>()
  const stats: BackfillStats = {
    dates: dates.length,
    facilitiesDiscovered: 0,
    reportsDiscovered: 0,
    processed: 0,
    insertedOrUpdated: 0,
    skippedExisting: 0,
    geocoded: 0,
    geocodeMisses: 0,
    failures: [],
  }

  let processedCount = 0
  let nextRemoteRequestAt = 0
  let nextGeocodeAt = 0

  for (const day of dates) {
    if (options.limit && processedCount >= options.limit) break

    console.log(`[philly-inspections] ${day}: discovering facilities`)
    const session = createPhillySession()

    try {
      nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
      await initPhillySession(session)

      const searchResults = await fetchInspectionLinksForDay(day, session, async () => {
        nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
      })

      stats.facilitiesDiscovered += searchResults.length
      console.log(`[philly-inspections] ${day}: found ${searchResults.length} inspection links`)

      for (const searchResult of searchResults) {
        if (options.limit && processedCount >= options.limit) break

        try {
          nextRemoteRequestAt = await sleepUntil(nextRemoteRequestAt, options.remoteDelayMs)
          const inspectionHtml = await fetchHtml(searchResult.inspectionPageUrl, {
            session,
            referer: searchResult.searchPageUrl,
          })
          const report = parseInspectionPage(inspectionHtml, searchResult)
          stats.reportsDiscovered += 1
          processedCount += 1

          const existing = !options.refreshExisting
            ? await prisma.inspection.findFirst({
                where: {
                  cityKey: PHILADELPHIA.key,
                  inspectionId: report.inspectionId,
                },
                select: { id: true },
              })
            : null

          if (existing) {
            stats.skippedExisting += 1
            continue
          }

          const normalized = await normalizeReport(
            report,
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
                  cityKey: PHILADELPHIA.key,
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
                cityKey: PHILADELPHIA.key,
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
          }

          stats.insertedOrUpdated += 1
        } catch (error) {
          stats.failures.push({
            date: day,
            facilityId: searchResult.facilityId,
            inspectionId: searchResult.inspectionId,
            error: toErrorMessage(error),
          })
          console.error(`[philly-inspections] ${day} ${searchResult.inspectionId}: ${toErrorMessage(error)}`)
        }
      }
    } catch (error) {
      stats.failures.push({
        date: day,
        error: toErrorMessage(error),
      })
      console.error(`[philly-inspections] ${day}: ${toErrorMessage(error)}`)
    }
  }

  if (!options.dryRun) {
    await invalidateCache(`${PHILADELPHIA.key}:inspections:`)
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

async function fetchInspectionLinksForDay(
  isoDate: string,
  session: PhillySession,
  beforeRequest: () => Promise<void>
): Promise<FacilityReportSummary[]> {
  const collected = new Map<string, FacilityReportSummary>()
  let start = 1
  let total = 0

  do {
    await beforeRequest()

    const url = new URL(SEARCH_PATH, PHILLY_BASE_URL)
    const [month, day, year] = formatSearchDate(isoDate).split('/')
    url.searchParams.set('start', String(start))
    url.searchParams.set('kw1', '')
    url.searchParams.set('rel1', 'F.organization_facility')
    url.searchParams.set('kw2', '')
    url.searchParams.set('rel2', 'F.organization_facility')
    url.searchParams.set('zc', '')
    url.searchParams.set('facType', 'Any')
    url.searchParams.set('sd', `${month}/${day}/${year}`)
    url.searchParams.set('ed', `${month}/${day}/${year}`)
    url.searchParams.set('dtRng', 'YES')
    url.searchParams.set('pre', 'Contains')
    url.searchParams.set('subType', 'Any')

    const html = await fetchHtml(url, { session })
    const results = parseSearchResultLinks(html)

    for (const result of results) {
      result.searchPageUrl = url.toString()
      collected.set(result.inspectionId, result)
    }

    total = parseSearchTotal(html)
    if (results.length === 0) break
    start += SEARCH_PAGE_SIZE
  } while (start <= total)

  return Array.from(collected.values())
}

function parseSearchTotal(html: string): number {
  const match = html.match(/Displaying results\s+\d+\s*&ndash;\s*\d+\s+of\s+(\d+)/i)
  if (match?.[1]) {
    return parseInt(match[1], 10)
  }

  const emptyMatch = html.match(/<b>\s*(\d+)\s+Facilities matched\s*<\/b>/i)
  if (emptyMatch?.[1]) {
    return parseInt(emptyMatch[1], 10)
  }

  return 0
}

function parseSearchResultLinks(html: string): FacilityReportSummary[] {
  const reports: FacilityReportSummary[] = []

  for (const match of Array.from(html.matchAll(SEARCH_RESULT_RE))) {
    const inspectionPageUrl = new URL(match[5] ?? '', PHILLY_BASE_URL).toString()
    const inspectionId = cleanHtmlText(match[6])
    if (!inspectionId) continue

    reports.push({
      facilityId: cleanHtmlText(match[1]),
      inspectionId,
      dbaName: cleanHtmlText(match[2]),
      addressLine1: cleanHtmlText(match[3]),
      addressLine2: cleanHtmlText(match[4]),
      inspectionDate: cleanHtmlText(match[7]),
      violationSummaries: [],
      inspectionPageUrl,
      searchPageUrl: '',
    })
  }

  return reports
}

function parseInspectionPage(html: string, fallback: FacilityReportSummary): FacilityReportSummary {
  const reportBlocks = Array.from(html.matchAll(REPORT_BLOCK_RE))
  const matchedBlock =
    reportBlocks.find((match) => extractInspectionId(new URL(match[6] ?? '', PHILLY_BASE_URL).toString()) === fallback.inspectionId) ??
    reportBlocks[0]

  if (!matchedBlock) {
    throw new Error(`Inspection report block missing for ${fallback.inspectionId}`)
  }

  const innerHtml = matchedBlock[5] ?? ''
  const violationSummaries = Array.from(
    innerHtml.matchAll(/<div style="background-color:#EFEFEF;padding:5px;">\s*([\s\S]*?)\s*<\/div>/gi)
  )
    .map((item) => cleanHtmlText(item[1]))
    .filter((item) => item.length > 0)

  return {
    facilityId: fallback.facilityId,
    inspectionId: fallback.inspectionId,
    dbaName: cleanHtmlText(matchedBlock[1]) || fallback.dbaName,
    addressLine1: cleanHtmlText(matchedBlock[2]) || fallback.addressLine1,
    addressLine2: cleanHtmlText(matchedBlock[3]) || fallback.addressLine2,
    inspectionDate: cleanHtmlText(matchedBlock[4]) || fallback.inspectionDate,
    violationSummaries,
    inspectionPageUrl: fallback.inspectionPageUrl,
    searchPageUrl: fallback.searchPageUrl,
  }
}

async function normalizeReport(
  summary: FacilityReportSummary,
  geocodeCache: Map<string, GeocodeHit>,
  stats: BackfillStats,
  beforeGeocode: () => Promise<void>
): Promise<StoredInspectionRecord> {
  const dbaName = firstNonEmpty(summary.dbaName, 'Philadelphia Food Inspection') ?? 'Philadelphia Food Inspection'
  const dateText = normalizeDateText(firstNonEmpty(summary.inspectionDate, null))
  const inspectionDate = dateText ? parseStoredDate(dateText) : null
  const zip = extractZip(summary.addressLine2, summary.addressLine1)
  const streetAddress = normalizeStreetAddress(firstNonEmpty(summary.addressLine1, null))
  const inspectionType = null
  const violations = joinViolations(summary.violationSummaries)
  const results = summary.violationSummaries.length > 0 ? 'Corrections Required' : 'In Compliance'

  let coordinates: GeocodeHit = {
    ward: null,
    latitude: null,
    longitude: null,
  }

  if (streetAddress) {
    const cacheKey = `${streetAddress}|${zip ?? ''}`.toUpperCase()
    const cached = geocodeCache.get(cacheKey)
    if (cached) {
      coordinates = cached
    } else {
      await beforeGeocode()
      const geocoded = await geocodeAddress(
        zip ? `${streetAddress} ${zip}` : streetAddress,
        PHILADELPHIA.key
      )
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
    inspectionId: summary.inspectionId,
    dbaName,
    licenseNo: null,
    address: streetAddress,
    zip,
    inspectionType,
    results,
    violations,
    inspectionDate,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ward: coordinates.ward,
  }
}

function createPhillySession(): PhillySession {
  return { cookies: new Map() }
}

async function initPhillySession(session: PhillySession): Promise<void> {
  await fetchHtml(PHILLY_BASE_URL, { session })
}

async function fetchHtml(
  url: URL | string,
  options?: {
    session?: PhillySession
    referer?: string
  }
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }

      const cookieHeader = serializeCookies(options?.session)
      if (cookieHeader) headers.Cookie = cookieHeader
      if (options?.referer) headers.Referer = options.referer

      const res = await fetch(String(url), {
        headers,
        signal: AbortSignal.timeout(20000),
      })

      updateSessionCookies(options?.session, res)

      if (!res.ok) {
        const error = new Error(`Request failed (${res.status}) for ${String(url)}`)
        if (attempt < MAX_FETCH_ATTEMPTS && RETRYABLE_STATUS_CODES.has(res.status)) {
          const waitMs = getRetryDelayMs(attempt, res.headers.get('retry-after'))
          console.warn(`[philly-inspections] retrying ${String(url)} after ${waitMs}ms (${res.status}, attempt ${attempt}/${MAX_FETCH_ATTEMPTS})`)
          await sleep(waitMs)
          lastError = error
          continue
        }

        throw error
      }

      const buffer = await res.arrayBuffer()
      return new TextDecoder('latin1').decode(buffer)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))

      if (attempt < MAX_FETCH_ATTEMPTS && isRetryableFetchError(normalized)) {
        const waitMs = getRetryDelayMs(attempt)
        console.warn(`[philly-inspections] retrying ${String(url)} after ${waitMs}ms (${normalized.message}, attempt ${attempt}/${MAX_FETCH_ATTEMPTS})`)
        await sleep(waitMs)
        lastError = normalized
        continue
      }

      throw normalized
    }
  }

  throw lastError ?? new Error(`Request failed for ${String(url)}`)
}

function serializeCookies(session?: PhillySession): string | undefined {
  if (!session || session.cookies.size === 0) return undefined
  return Array.from(session.cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function updateSessionCookies(session: PhillySession | undefined, res: Response): void {
  if (!session) return

  const headerBag = res.headers as Headers & { getSetCookie?: () => string[] }
  const setCookieHeaders =
    typeof headerBag.getSetCookie === 'function'
      ? headerBag.getSetCookie()
      : splitSetCookieHeader(res.headers.get('set-cookie'))

  for (const rawCookie of setCookieHeaders) {
    const [pair] = rawCookie.split(';')
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue

    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()
    if (!name || !value) continue
    session.cookies.set(name, value)
  }
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

function joinViolations(values: string[]): string | null {
  const cleaned = Array.from(
    new Set(
      values
        .map((value) => cleanHtmlText(value))
        .filter(Boolean)
    )
  )

  return cleaned.length > 0 ? cleaned.join(' | ') : null
}

function normalizeDateText(value: string | null): string | null {
  if (!value) return null

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null

  const [, month, day, year] = match
  return `${year}-${month}-${day}`
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

  const base = 12000
  const jitter = Math.floor(Math.random() * 3000)
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

function extractInspectionId(url: string): string | null {
  return new URL(url).searchParams.get('inspectionID')
}

function firstNonEmpty<T extends string | null>(...values: T[]): T | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value as T
    }
  }
  return null
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

main().catch((error) => {
  console.error('[philly-inspections-backfill]', error)
  process.exitCode = 1
})
