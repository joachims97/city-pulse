/**
 * City council legislation via city-specific providers.
 * Uses Legistar where it works, Chicago Clerk eLMS for Chicago,
 * and LA Clerk Connect for Los Angeles.
 */
import { prisma } from '@/lib/prisma'
import { getCached } from '@/lib/cache'
import { invalidateCache } from '@/lib/cache'
import { sanitizeSummaryText, summarizeAgendaItem } from '@/lib/claude'
import {
  extractDocumentTextFromHtml,
  extractDocumentTextFromUrl,
  isSubstantiveDocumentText,
} from '@/lib/documentText'
import { CACHE_TTL } from '@/config/app'
import type {
  AgendaProvider,
  ChicagoElmsAgendaProvider,
  CityConfig,
  EScribeAgendaProvider,
  LAClerkConnectAgendaProvider,
  LegistarHtmlAgendaProvider,
  LegistarMattersAgendaProvider,
} from '@/types/city'

export interface AgendaEvent {
  eventId: string
  eventDate: string | null
  bodyName: string
  location: string | null
  items: AgendaItem[]
}

export interface AgendaItem {
  id: string
  eventId: string
  cityKey: string
  matterTitle: string
  matterType: string | null
  matterStatus: string | null
  matterFile: string | null
  matterDate: string | null
  sourceUrl: string | null
  agendaNote: string | null
  hasFullText: boolean
  aiSummary: string | null
  summarizedAt: string | null
}

interface RawAgendaItem {
  externalId: string
  bodyName: string | null
  matterTitle: string
  matterType: string | null
  matterStatus: string | null
  matterFile: string | null
  matterDate: string | null
  sourceUrl: string | null
  agendaNote: string | null
}

interface LegistarMatter {
  MatterId: number
  MatterGuid?: string
  MatterFile?: string
  MatterName?: string
  MatterTitle?: string
  MatterTypeName?: string
  MatterStatusName?: string
  MatterBodyName?: string
  MatterIntroDate?: string
  MatterAgendaDate?: string
  MatterPassedDate?: string
  MatterLastModifiedUtc?: string
  MatterNotes?: string
}

interface ChicagoElmsMatter {
  matterId: string
  recordNumber?: string
  title?: string
  controllingBody?: string
  type?: string
  status?: string
  subStatus?: string
  introductionDate?: string
  finalActionDate?: string
  filingSponsor?: string
  lastPublicationDate?: string
}

interface ChicagoElmsSearchResponse {
  data?: ChicagoElmsMatter[]
}

interface ChicagoElmsAttachment {
  fileName?: string
  path?: string
  attachmentType?: string
}

interface ChicagoElmsMatterDetail extends ChicagoElmsMatter {
  attachments?: ChicagoElmsAttachment[]
}

interface EScribeLegislationRow {
  Number?: string
  Text?: string
  Department?: string
  Stage?: string
  Status?: string
  MeetingId?: string
  AgendaItemId?: string | number
  MeetingDate?: string
}

interface EScribeSearchResponse {
  data?: EScribeLegislationRow[]
}

interface LegistarAttachment {
  MatterAttachmentName?: string
  MatterAttachmentHyperlink?: string
  MatterAttachmentFileName?: string
}

interface ProviderFetchResult {
  items: RawAgendaItem[]
  sourceLabel?: string
}

interface StoredAgendaItemForFullText {
  id: string
  eventId: string
  matterTitle: string
  agendaFileUrl: string | null
  fullText: string | null
}

interface AgendaFullTextResult {
  fullText: string | null
  fullTextSourceUrl: string | null
}

type AgendaView = 'preview' | 'full'

const LEGISTAR_API_BASE = 'https://webapi.legistar.com/v1'
const CHICAGO_ELMS_API_BASE = 'https://api.chicityclerkelms.chicago.gov'
const CHICAGO_ELMS_DETAIL_BASE = 'https://chicityclerkelms.chicago.gov/'
const DEFAULT_MAX_ITEMS = 12
const FULL_AGENDA_MAX_ITEMS = 250
const DEFAULT_STALE_AFTER_DAYS = 120
const DEFAULT_LA_LOOKBACK_DAYS = 30
const SUMMARY_DISABLED_CITY_KEYS = new Set(['chicago'])

export async function getAgendaItems(city: CityConfig, view: AgendaView = 'preview'): Promise<AgendaEvent[]> {
  const cacheKey = `${city.key}:agenda:v6:current:${view}`

  return getCached(
    cacheKey,
    city.key,
    'agenda',
    () => fetchAgenda(city, view),
    CACHE_TTL.agenda
  )
}

async function fetchAgenda(city: CityConfig, view: AgendaView): Promise<AgendaEvent[]> {
  const provider = city.agendaProvider ?? createDefaultAgendaProvider(city)
  if (!provider) {
    throw new Error(`Agenda provider not configured for ${city.key}`)
  }

  try {
    const { items: rawItems, sourceLabel } = await fetchProviderItems(
      provider,
      view === 'full' ? FULL_AGENDA_MAX_ITEMS : undefined
    )
    if (!rawItems.length) return []

    const bodyName = city.councilBodyName ?? 'City Council'
    const sectionId = `${city.key}:legislation`

    const items = await persistAgendaItems(city, sectionId, bodyName, rawItems)

    return [{
      eventId: sectionId,
      eventDate: latestMatterDate(items),
      bodyName,
      location: sourceLabel ?? providerLabel(provider),
      items,
    }]
  } catch (err) {
    throw new Error(`Failed to load agenda for ${city.key}`, { cause: err })
  }
}

export interface AgendaSummaryBackfillResult {
  cityKey: string
  fetchedItems: number
  queuedItems: number
  summarized: number
  skipped: number
  failed: number
}

export interface AgendaFullTextBackfillResult {
  cityKey: string
  fetchedItems: number
  queuedItems: number
  hydrated: number
  skipped: number
  failed: number
  withFullText: number
}

export async function backfillAgendaSummaryCache(
  city: CityConfig,
  days = 180,
  limit?: number
): Promise<AgendaSummaryBackfillResult> {
  if (SUMMARY_DISABLED_CITY_KEYS.has(city.key)) {
    return {
      cityKey: city.key,
      fetchedItems: 0,
      queuedItems: 0,
      summarized: 0,
      skipped: 0,
      failed: 0,
    }
  }

  await getAgendaItems(city, 'full')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const queuedItems = await prisma.agendaItem.findMany({
    where: {
      cityKey: city.key,
      eventDate: { gte: cutoff },
      fullText: { not: null },
      aiSummary: null,
    },
    orderBy: { eventDate: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      matterTitle: true,
      fullText: true,
      agendaNote: true,
      aiSummary: true,
    },
  })

  let summarized = 0
  let skipped = 0
  let failed = 0

  for (const item of queuedItems) {
    if (item.aiSummary) {
      skipped += 1
      continue
    }

    const summary = await summarizeAgendaItem({
      matterTitle: item.matterTitle,
      fullText: item.fullText ?? '',
      agendaNote: item.agendaNote,
    })
    if (!summary) {
      failed += 1
      continue
    }

    try {
      await prisma.agendaItem.update({
        where: { id: item.id },
        data: {
          aiSummary: sanitizeSummaryText(summary),
          summarizedAt: new Date(),
        },
      })
      summarized += 1
    } catch (err) {
      console.warn(`[Agenda] Failed to persist summary for ${city.key}:${item.id}`, err)
      failed += 1
    }
  }

  if (summarized > 0) {
    await invalidateCache(`${city.key}:agenda:`).catch(() => {})
  }

  return {
    cityKey: city.key,
    fetchedItems: queuedItems.length,
    queuedItems: queuedItems.length,
    summarized,
    skipped,
    failed,
  }
}

export async function backfillAgendaFullTextCache(
  city: CityConfig,
  days = 180,
  limit?: number
): Promise<AgendaFullTextBackfillResult> {
  await getAgendaItems(city, 'full')

  const provider = city.agendaProvider ?? createDefaultAgendaProvider(city)
  if (!provider) {
    return {
      cityKey: city.key,
      fetchedItems: 0,
      queuedItems: 0,
      hydrated: 0,
      skipped: 0,
      failed: 0,
      withFullText: 0,
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const queuedItems = await prisma.agendaItem.findMany({
    where: {
      cityKey: city.key,
      eventDate: { gte: cutoff },
      fullText: null,
    },
    orderBy: { eventDate: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      eventId: true,
      matterTitle: true,
      agendaFileUrl: true,
      fullText: true,
    },
  }) as StoredAgendaItemForFullText[] | null

  if (!Array.isArray(queuedItems)) {
    return {
      cityKey: city.key,
      fetchedItems: 0,
      queuedItems: 0,
      hydrated: 0,
      skipped: 0,
      failed: 0,
      withFullText: 0,
    }
  }

  let hydrated = 0
  let skipped = 0
  let failed = 0
  let withFullText = 0

  for (const item of queuedItems) {
    if (item.fullText) {
      skipped += 1
      withFullText += 1
      continue
    }

    const fullText = await fetchStoredAgendaItemFullText(provider, item)
    if (!fullText.fullText) {
      failed += 1
      continue
    }

    try {
      await prisma.agendaItem.update({
        where: { id: item.id },
        data: {
          fullText: fullText.fullText,
          fullTextSourceUrl: fullText.fullTextSourceUrl,
          fullTextFetchedAt: new Date(),
        },
      })
      hydrated += 1
      withFullText += 1
    } catch (err) {
      console.warn(`[Agenda] Failed to persist full text for ${city.key}:${item.id}`, err)
      failed += 1
    }
  }

  if (hydrated > 0) {
    await invalidateCache(`${city.key}:agenda:`).catch(() => {})
  }

  return {
    cityKey: city.key,
    fetchedItems: queuedItems.length,
    queuedItems: queuedItems.length,
    hydrated,
    skipped,
    failed,
    withFullText,
  }
}

function createDefaultAgendaProvider(city: CityConfig): AgendaProvider | undefined {
  if (!city.legistarClient) return undefined

  return {
    type: 'legistar-matters',
    client: city.legistarClient,
    bodyName: city.councilBodyName,
    detailBaseUrl: `https://${city.legistarClient}.legistar.com`,
    staleAfterDays: DEFAULT_STALE_AFTER_DAYS,
    maxItems: DEFAULT_MAX_ITEMS,
  }
}

async function fetchProviderItems(
  provider: AgendaProvider,
  maxItemsOverride?: number
): Promise<ProviderFetchResult> {
  switch (provider.type) {
    case 'legistar-matters':
      return { items: await fetchLegistarMatters(provider, maxItemsOverride) }
    case 'legistar-html':
      return { items: await fetchLegistarHtml(provider, maxItemsOverride) }
    case 'chicago-elms':
      return { items: await fetchChicagoElms(provider, maxItemsOverride) }
    case 'la-clerk-connect':
      return { items: await fetchLAClerkConnect(provider, maxItemsOverride) }
    case 'escribe':
      return fetchEScribe(provider, maxItemsOverride)
  }
}

async function fetchLegistarMatters(
  provider: LegistarMattersAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  const maxItems = maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS
  let lastError: unknown = null

  try {
    const url = new URL(`${LEGISTAR_API_BASE}/${provider.client}/Matters`)
    url.searchParams.set('$orderby', 'MatterLastModifiedUtc desc')
    url.searchParams.set('$top', String(maxItems * 4))

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    })

    if (!res.ok) throw new Error(`Legistar Matters error: ${res.status}`)

    const matters = (await res.json()) as LegistarMatter[]
    const items = dedupeItems(
      matters
        .map((matter) => mapLegistarMatter(provider, matter))
        .filter(isRawAgendaItem)
        .filter((item) => keepLegistarMatter(provider, item))
    )

    if (items.length && mattersAreFresh(items, provider.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS)) {
      return items.slice(0, maxItems)
    }
  } catch (err) {
    lastError = err
    console.warn('[Agenda] Legistar Matters fallback:', err)
  }

  if (provider.fallback) {
    const fallback = await fetchProviderItems(provider.fallback, maxItemsOverride)
    return fallback.items
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error('Legistar Matters fetch failed')
  }

  return []
}

function keepLegistarMatter(
  provider: LegistarMattersAgendaProvider,
  item: RawAgendaItem
): boolean {
  const matterType = normalizeText(item.matterType)
  const matterTitle = normalizeText(item.matterTitle)

  if (provider.excludeMatterTypes?.some((value) => normalizeText(value) === matterType)) {
    return false
  }

  if (provider.excludeTitlePatterns?.some((value) => matterTitle.includes(normalizeText(value)))) {
    return false
  }

  if (provider.maxAgendaLeadDays !== undefined && item.agendaNote) {
    const introduced = extractMatterNoteValue(item.agendaNote, 'Introduced')
    const agenda = extractMatterNoteValue(item.agendaNote, 'Agenda')
    const introducedDate = introduced ? new Date(introduced) : null
    const agendaDate = agenda ? new Date(agenda) : null

    if (
      introducedDate &&
      agendaDate &&
      !Number.isNaN(introducedDate.getTime()) &&
      !Number.isNaN(agendaDate.getTime())
    ) {
      const leadDays = Math.round((agendaDate.getTime() - introducedDate.getTime()) / (1000 * 60 * 60 * 24))
      if (leadDays > provider.maxAgendaLeadDays) {
        return false
      }
    }
  }

  return true
}

function mapLegistarMatter(
  provider: LegistarMattersAgendaProvider,
  matter: LegistarMatter
): RawAgendaItem | null {
  const matterTitle = cleanText(matter.MatterTitle) ?? cleanText(matter.MatterName)
  if (!matterTitle) return null

  const matterDate = firstNonEmpty(
    normalizeDate(matter.MatterIntroDate),
    normalizeDate(matter.MatterAgendaDate),
    normalizeDate(matter.MatterPassedDate),
    normalizeDate(matter.MatterLastModifiedUtc)
  )

  return {
    externalId: `${provider.client}:matter:${matter.MatterId}`,
    bodyName: cleanText(matter.MatterBodyName) ?? provider.bodyName ?? null,
    matterTitle,
    matterType: cleanText(matter.MatterTypeName),
    matterStatus: cleanText(matter.MatterStatusName),
    matterFile: cleanText(matter.MatterFile),
    matterDate,
    sourceUrl: buildLegistarMatterUrl(provider.detailBaseUrl, matter),
    agendaNote: firstNonEmpty(
      cleanText(matter.MatterNotes),
      buildMatterNote([
        ['Body', cleanText(matter.MatterBodyName)],
        ['Introduced', formatDisplayDate(matter.MatterIntroDate)],
        ['Agenda', formatDisplayDate(matter.MatterAgendaDate)],
        ['Passed', formatDisplayDate(matter.MatterPassedDate)],
      ])
    ),
  }
}

async function fetchLegistarHtml(
  provider: LegistarHtmlAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  const maxItems = maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS
  const initialHtml = await fetchText(provider.baseUrl)

  const form = new URLSearchParams({
    __EVENTTARGET: 'ctl00$ContentPlaceHolder1$btnSearch',
    __EVENTARGUMENT: '',
    __VIEWSTATE: getHiddenInputValue(initialHtml, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: getHiddenInputValue(initialHtml, '__VIEWSTATEGENERATOR'),
    __PREVIOUSPAGE: getHiddenInputValue(initialHtml, '__PREVIOUSPAGE'),
    'ctl00$ContentPlaceHolder1$txtSearch': provider.searchText ?? '',
    'ctl00$ContentPlaceHolder1$lstYears': provider.yearFilter ?? 'This Year',
    'ctl00$ContentPlaceHolder1$lstTypeBasic': provider.typeFilter ?? 'All Types',
    'ctl00$ContentPlaceHolder1$chkID': 'on',
    'ctl00$ContentPlaceHolder1$chkText': 'on',
  })

  const res = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Legistar search error: ${res.status}`)
  }

  const html = await res.text()
  return parseLegistarHtmlRows(html, provider.baseUrl).slice(0, maxItems)
}

async function fetchLAClerkConnect(
  provider: LAClerkConnectAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  const maxItems = maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS
  const lookbackDays = provider.lookbackDays ?? DEFAULT_LA_LOOKBACK_DAYS
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - lookbackDays)

  const form = new URLSearchParams({
    searchform: 'advanced',
    DateRecStart: formatMonthDayYear(start),
    DateRecEnd: formatMonthDayYear(end),
  })

  const searchUrl = provider.searchUrl ?? 'https://cityclerk.lacity.org/lacityclerkconnect/index.cfm?fa=vcfi.doSearch'
  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`LA Clerk Connect error: ${res.status}`)
  }

  const html = await res.text()
  return parseLAClerkRows(html, provider.detailBaseUrl ?? searchUrl).slice(0, maxItems)
}

async function fetchChicagoElms(
  provider: ChicagoElmsAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  const maxItems = maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS
  const apiBaseUrl = provider.apiBaseUrl ?? CHICAGO_ELMS_API_BASE
  const detailBaseUrl = provider.detailBaseUrl ?? CHICAGO_ELMS_DETAIL_BASE
  const url = new URL('search', ensureTrailingSlash(apiBaseUrl))

  url.searchParams.set('filter', provider.filter ?? 'supersededBy eq null')
  url.searchParams.set('sort', provider.sort ?? 'lastPublicationDate desc')
  url.searchParams.set('top', String(maxItems))

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Chicago eLMS error: ${res.status}`)
  }

  const payload = (await res.json()) as ChicagoElmsSearchResponse

  return dedupeItems(
    (payload.data ?? [])
      .map((matter) => mapChicagoElmsMatter(matter, detailBaseUrl))
      .filter(isRawAgendaItem)
  )
}

async function fetchEScribe(
  provider: EScribeAgendaProvider,
  maxItemsOverride?: number
): Promise<ProviderFetchResult> {
  const directItems = await fetchEScribeLegislationHistory(provider, maxItemsOverride)
  if (directItems.length) {
    return {
      items: directItems,
      sourceLabel: 'Raleigh eScribe Legislation History',
    }
  }

  const fallbackItems = await fetchEScribeAgendaItems(provider, maxItemsOverride)
  return {
    items: fallbackItems,
    sourceLabel: fallbackItems.length ? 'Raleigh eScribe Council Agenda Items' : 'eScribe',
  }
}

async function fetchEScribeLegislationHistory(
  provider: EScribeAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  try {
    const baseUrl = new URL(provider.baseUrl)
    const apiUrl = new URL('/GetSearchData.asmx/GetLegislationData', ensureTrailingSlash(baseUrl.origin))
    apiUrl.search = baseUrl.search

    const res = await fetch(apiUrl.toString(), {
      headers: { 'User-Agent': 'CityPulse/1.0' },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 0 },
    })
    if (!res.ok) return []

    const payload = await res.json() as EScribeSearchResponse
    return dedupeItems(
      (payload.data ?? [])
        .map((row) => mapEScribeLegislationRow(baseUrl.origin, row))
        .filter(isRawAgendaItem)
    ).slice(0, maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS)
  } catch (err) {
    console.warn('[Agenda] eScribe legislation history failed:', err)
    return []
  }
}

async function fetchEScribeAgendaItems(
  provider: EScribeAgendaProvider,
  maxItemsOverride?: number
): Promise<RawAgendaItem[]> {
  const maxItems = maxItemsOverride ?? provider.maxItems ?? DEFAULT_MAX_ITEMS
  const maxMeetings = maxItemsOverride ? Math.max(provider.maxMeetings ?? 3, 8) : (provider.maxMeetings ?? 3)
  const lookbackDays = provider.lookbackDays ?? 120
  const keywords = provider.meetingTypeKeywords ?? ['City Council']
  const baseUrl = provider.baseUrl

  const baseHtml = await fetchText(baseUrl)
  const meetingUrls = new Set<string>(
    extractEScribeMeetingLinks(baseHtml, baseUrl, keywords)
  )

  if (meetingUrls.size < maxMeetings) {
    const expandedLinks = extractEScribeExpandedLinks(baseHtml, baseUrl, keywords)
    for (const expandedLink of expandedLinks.slice(0, maxMeetings)) {
      const expandedHtml = await fetchText(expandedLink)
      for (const meetingUrl of extractEScribeMeetingLinks(expandedHtml, expandedLink, keywords)) {
        meetingUrls.add(meetingUrl)
      }
      if (meetingUrls.size >= maxMeetings) break
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookbackDays)

  const rawItems: RawAgendaItem[] = []

  for (const meetingUrl of Array.from(meetingUrls).slice(0, maxMeetings)) {
    const html = await fetchText(meetingUrl)
    const parsed = parseEScribeMeetingPage(html, meetingUrl)
    if (!parsed || parsed.meetingDate < cutoff) continue

    rawItems.push(...parsed.items)
    if (rawItems.length >= maxItems) break
  }

  return dedupeItems(rawItems).slice(0, maxItems)
}

function mapEScribeLegislationRow(origin: string, row: EScribeLegislationRow): RawAgendaItem | null {
  const matterTitle = cleanText(row.Text)
  if (!matterTitle) return null

  const meetingUrl =
    row.MeetingId && row.AgendaItemId !== undefined
      ? new URL(`Meeting.aspx?Id=${row.MeetingId}&Item=${row.AgendaItemId}&Agenda=Agenda`, ensureTrailingSlash(origin)).toString()
      : row.MeetingId
        ? new URL(`Meeting.aspx?Id=${row.MeetingId}&Agenda=Agenda`, ensureTrailingSlash(origin)).toString()
        : null

  return {
    externalId: `escribe:legislation:${row.MeetingId ?? 'na'}:${row.AgendaItemId ?? row.Number ?? matterTitle}`,
    bodyName: 'City Council',
    matterTitle,
    matterType: cleanText(row.Department) ?? inferEScribeMatterType(matterTitle),
    matterStatus: cleanText(row.Status),
    matterFile: cleanText(row.Number),
    matterDate: normalizeDate(row.MeetingDate),
    sourceUrl: meetingUrl,
    agendaNote: buildMatterNote([
      ['Department', cleanText(row.Department)],
      ['Stage', cleanText(row.Stage)],
      ['Meeting', formatDisplayDate(row.MeetingDate)],
    ]),
  }
}

async function persistAgendaItems(
  city: CityConfig,
  sectionId: string,
  defaultBodyName: string,
  rawItems: RawAgendaItem[]
): Promise<AgendaItem[]> {
  return Promise.all(
    rawItems.map(async (rawItem) => {
      const eventDate = parseDate(rawItem.matterDate) ?? new Date()

      let dbItem: {
        id: string
        agendaNote: string | null
        agendaFileUrl: string | null
        fullText: string | null
        aiSummary: string | null
        summarizedAt: Date | null
      } | null = null

      try {
        dbItem = await prisma.agendaItem.upsert({
          where: { cityKey_eventId: { cityKey: city.key, eventId: rawItem.externalId } },
          update: {
            eventDate,
            eventBodyName: rawItem.bodyName ?? defaultBodyName,
            matterTitle: rawItem.matterTitle,
            matterType: rawItem.matterType ?? undefined,
            matterStatus: rawItem.matterStatus ?? undefined,
            agendaNote: rawItem.agendaNote ?? undefined,
            agendaFileUrl: rawItem.sourceUrl ?? undefined,
          },
          create: {
            eventId: rawItem.externalId,
            cityKey: city.key,
            eventDate,
            eventBodyName: rawItem.bodyName ?? defaultBodyName,
            matterTitle: rawItem.matterTitle,
            matterType: rawItem.matterType,
            matterStatus: rawItem.matterStatus,
            agendaNote: rawItem.agendaNote,
            agendaFileUrl: rawItem.sourceUrl,
          },
          select: {
            id: true,
            agendaNote: true,
            agendaFileUrl: true,
            fullText: true,
            aiSummary: true,
            summarizedAt: true,
          },
        })
      } catch {
        // DB is optional for this app. Live fetches still render without persistence.
      }

      return {
        id: dbItem?.id ?? rawItem.externalId,
        eventId: sectionId,
        cityKey: city.key,
        matterTitle: rawItem.matterTitle,
        matterType: rawItem.matterType,
        matterStatus: rawItem.matterStatus,
        matterFile: rawItem.matterFile,
        matterDate: rawItem.matterDate,
        sourceUrl: rawItem.sourceUrl ?? dbItem?.agendaFileUrl ?? null,
        agendaNote: rawItem.agendaNote ?? dbItem?.agendaNote ?? null,
        hasFullText: Boolean(dbItem?.fullText),
        aiSummary: sanitizeSummaryText(dbItem?.aiSummary ?? null),
        summarizedAt: dbItem?.summarizedAt?.toISOString() ?? null,
      }
    })
  )
}

async function fetchStoredAgendaItemFullText(
  provider: AgendaProvider,
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  try {
    switch (provider.type) {
      case 'legistar-matters':
        return fetchLegistarMatterFullText(provider, item)
      case 'legistar-html':
        return fetchLegistarHtmlFullText(item)
      case 'chicago-elms':
        return fetchChicagoElmsFullText(provider, item)
      case 'la-clerk-connect':
        return fetchLAClerkConnectFullText(item)
      case 'escribe':
        return fetchEScribeFullText(item)
    }
  } catch (err) {
    console.warn(`[Agenda] Full text fetch failed for ${item.eventId}:`, err)
  }

  return { fullText: null, fullTextSourceUrl: null }
}

async function fetchLegistarMatterFullText(
  provider: LegistarMattersAgendaProvider,
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  const matterId = item.eventId.match(/:(\d+)$/)?.[1]
  if (!matterId) return { fullText: null, fullTextSourceUrl: null }

  const attachmentsUrl = `${LEGISTAR_API_BASE}/${provider.client}/Matters/${matterId}/Attachments`
  const res = await fetch(attachmentsUrl, {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 0 },
  })

  if (res.ok) {
    const attachments = (await res.json()) as LegistarAttachment[]
    const candidates = attachments
      .map((attachment) => ({
        url: cleanText(attachment.MatterAttachmentHyperlink),
        label: firstNonEmpty(
          cleanText(attachment.MatterAttachmentName),
          cleanText(attachment.MatterAttachmentFileName)
        ),
      }))
      .filter((candidate): candidate is { url: string; label: string | null } => Boolean(candidate.url))
      .sort((a, b) => rankLegistarAttachmentCandidate(a.label, a.url) - rankLegistarAttachmentCandidate(b.label, b.url))

    const fromAttachments = await fetchFirstSubstantiveDocumentText(candidates)
    if (fromAttachments.fullText) return fromAttachments
  }

  if (item.agendaFileUrl) {
    return fetchLegistarHtmlFullText(item)
  }

  return { fullText: null, fullTextSourceUrl: null }
}

async function fetchLegistarHtmlFullText(
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  if (!item.agendaFileUrl) return { fullText: null, fullTextSourceUrl: null }

  const html = await fetchText(item.agendaFileUrl)
  const candidates = extractLegistarDocumentCandidates(html, item.agendaFileUrl)
  const fromDocuments = await fetchFirstSubstantiveDocumentText(candidates)
  if (fromDocuments.fullText) return fromDocuments

  return { fullText: null, fullTextSourceUrl: null }
}

async function fetchChicagoElmsFullText(
  provider: ChicagoElmsAgendaProvider,
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  const matterId = item.eventId.replace(/^chicago-elms:/, '').trim()
  if (!matterId) return { fullText: null, fullTextSourceUrl: null }

  const apiBaseUrl = provider.apiBaseUrl ?? CHICAGO_ELMS_API_BASE
  const detailUrl = new URL(`matter/${matterId}`, ensureTrailingSlash(apiBaseUrl))
  const res = await fetch(detailUrl.toString(), {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 0 },
  })

  if (!res.ok) return { fullText: null, fullTextSourceUrl: null }

  const detail = await res.json() as ChicagoElmsMatterDetail
  const candidates = (detail.attachments ?? [])
    .map((attachment) => ({
      url: cleanText(attachment.path),
      label: cleanText([attachment.attachmentType, attachment.fileName].filter(Boolean).join(' ')),
    }))
    .filter((candidate): candidate is { url: string; label: string | null } => Boolean(candidate.url))
    .sort((a, b) => rankChicagoAttachmentCandidate(a.label, a.url) - rankChicagoAttachmentCandidate(b.label, b.url))

  return fetchFirstSubstantiveDocumentText(candidates)
}

async function fetchLAClerkConnectFullText(
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  if (!item.agendaFileUrl) return { fullText: null, fullTextSourceUrl: null }

  const html = await fetchText(item.agendaFileUrl)
  const candidates = extractLADocumentCandidates(html, item.agendaFileUrl)
  return fetchFirstSubstantiveDocumentText(candidates)
}

async function fetchEScribeFullText(
  item: StoredAgendaItemForFullText
): Promise<AgendaFullTextResult> {
  if (!item.agendaFileUrl) return { fullText: null, fullTextSourceUrl: null }

  if (isDirectDocumentUrl(item.agendaFileUrl)) {
    const text = await extractDocumentTextFromUrl(item.agendaFileUrl)
    if (isSubstantiveDocumentText(text)) {
      return { fullText: text, fullTextSourceUrl: item.agendaFileUrl }
    }
  }

  const html = await fetchText(item.agendaFileUrl)
  const candidates = extractEScribeDocumentCandidates(html, item.agendaFileUrl)
  const fromDocuments = await fetchFirstSubstantiveDocumentText(candidates)
  if (fromDocuments.fullText) return fromDocuments

  const inlineText = extractEScribeDescriptionText(html)
  if (isSubstantiveDocumentText(inlineText)) {
    return { fullText: inlineText, fullTextSourceUrl: item.agendaFileUrl }
  }

  return { fullText: null, fullTextSourceUrl: null }
}

async function fetchFirstSubstantiveDocumentText(
  candidates: Array<{ url: string; label: string | null }>
): Promise<AgendaFullTextResult> {
  for (const candidate of candidates.slice(0, 6)) {
    const text = await extractDocumentTextFromUrl(candidate.url)
    if (isSubstantiveDocumentText(text)) {
      return {
        fullText: text,
        fullTextSourceUrl: candidate.url,
      }
    }
  }

  return { fullText: null, fullTextSourceUrl: null }
}

function extractLegistarDocumentCandidates(
  html: string,
  baseUrl: string
): Array<{ url: string; label: string | null }> {
  const candidates = extractAnchorCandidates(html, baseUrl).filter((candidate) => {
    const url = candidate.url.toLowerCase()
    return (
      (url.includes('viewreport.ashx') && (url.includes('n=text') || url.includes('extra=withtext'))) ||
      url.includes('fulltext=1') ||
      url.includes('view.ashx?m=f')
    )
  })

  return dedupeDocumentCandidates(candidates)
    .sort((a, b) => rankLegistarAttachmentCandidate(a.label, a.url) - rankLegistarAttachmentCandidate(b.label, b.url))
}

function extractLADocumentCandidates(
  html: string,
  baseUrl: string
): Array<{ url: string; label: string | null }> {
  const candidates = extractAnchorCandidates(html, baseUrl).filter((candidate) => {
    const url = candidate.url.toLowerCase()
    return url.includes('/onlinedocs/') || isDirectDocumentUrl(candidate.url)
  })

  return dedupeDocumentCandidates(candidates)
    .sort((a, b) => rankLAAttachmentCandidate(a.label, a.url) - rankLAAttachmentCandidate(b.label, b.url))
}

function extractEScribeDocumentCandidates(
  html: string,
  baseUrl: string
): Array<{ url: string; label: string | null }> {
  const candidates = extractAnchorCandidates(html, baseUrl).filter((candidate) =>
    candidate.url.toLowerCase().includes('filestream.ashx?documentid=')
  )

  return dedupeDocumentCandidates(candidates)
}

function extractAnchorCandidates(
  html: string,
  baseUrl: string
): Array<{ url: string; label: string | null }> {
  const candidates: Array<{ url: string; label: string | null }> = []

  for (const match of Array.from(html.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi))) {
    const href = decodeHtml(match[1] ?? '').trim()
    if (!href || href.startsWith('javascript:') || href === '#') continue

    candidates.push({
      url: resolveUrl(baseUrl, href),
      label: cleanText(match[2]),
    })
  }

  return candidates
}

function extractEScribeDescriptionText(html: string): string | null {
  const descriptions = Array.from(html.matchAll(/<div class="AgendaItemDescription"[^>]*>([\s\S]*?)<\/div>/gi))
    .map((match) => extractDocumentTextFromHtml(match[1] ?? ''))
    .filter((value): value is string => Boolean(value))

  if (!descriptions.length) return null
  return descriptions.join('\n\n')
}

function dedupeDocumentCandidates(
  candidates: Array<{ url: string; label: string | null }>
): Array<{ url: string; label: string | null }> {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false
    seen.add(candidate.url)
    return true
  })
}

function rankLegistarAttachmentCandidate(label: string | null, url: string): number {
  const haystack = `${label ?? ''} ${url}`.toLowerCase()
  if (haystack.includes('viewreport.ashx') && haystack.includes('n=text')) return 0
  if (haystack.includes('extra=withtext')) return 1
  if (haystack.includes('legislation text')) return 2
  if (haystack.includes('ordinance') || haystack.includes('resolution') || haystack.includes('leg ver')) return 3
  if (haystack.includes('fulltext=1')) return 4
  if (haystack.includes('view.ashx?m=f') && !haystack.includes('summary')) return 5
  if (haystack.includes('summary')) return 7
  if (haystack.includes('packet') || haystack.includes('pkt') || haystack.includes('appendix')) return 8
  return 6
}

function rankChicagoAttachmentCandidate(label: string | null, url: string): number {
  const haystack = `${label ?? ''} ${url}`.toLowerCase()
  if (haystack.includes('legislation')) return 0
  if (haystack.includes('ordinance') || haystack.includes('resolution')) return 1
  if (haystack.includes('pdf') && !haystack.includes('eds')) return 2
  if (haystack.includes('application') || haystack.includes('exhibit') || haystack.includes('narrative') || haystack.includes('eds')) return 5
  return 3
}

function rankLAAttachmentCandidate(label: string | null, url: string): number {
  const haystack = `${label ?? ''} ${url}`.toLowerCase()
  if (haystack.includes('ordinance') || haystack.includes('resolution') || haystack.includes('motion')) return 0
  if (haystack.includes('report') || haystack.includes('communication')) return 1
  if (haystack.endsWith('.pdf')) return 2
  return 3
}

function isDirectDocumentUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.html') ||
    lower.includes('viewreport.ashx') ||
    lower.includes('view.ashx?m=f') ||
    lower.includes('filestream.ashx?documentid=')
  )
}

function parseLegistarHtmlRows(html: string, baseUrl: string): RawAgendaItem[] {
  const rows = Array.from(
    html.matchAll(/<tr\b[^>]*class="(?:rgRow|rgAltRow)"[^>]*>([\s\S]*?)<\/tr>/gi)
  ) as RegExpMatchArray[]
  const items: RawAgendaItem[] = []

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1]

    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1])
    if (cells.length < 6) continue

    const matterFile = cleanText(cells[0])
    const matterTitle = cleanText(cells[cells.length - 1])
    if (!matterFile || !matterTitle) continue

    const hrefMatch = rowHtml.match(/href="([^"]*LegislationDetail\.aspx[^"]*)"/i)
    const sourceUrl = hrefMatch ? resolveUrl(baseUrl, decodeHtml(hrefMatch[1])) : null
    const detailId = sourceUrl ? new URL(sourceUrl).searchParams.get('ID') : null

    if (cells.length >= 8) {
      items.push({
        externalId: detailId ? `legistar-html:${detailId}` : `legistar-html:${matterFile}`,
        bodyName: cleanText(cells[4]),
        matterTitle,
        matterType: cleanText(cells[2]),
        matterStatus: cleanText(cells[3]),
        matterFile,
        matterDate: null,
        sourceUrl,
        agendaNote: buildMatterNote([
          ['Committee', cleanText(cells[4])],
          ['Prime sponsor', cleanText(cells[5])],
          ['Council sponsors', cleanText(cells[6])],
        ]),
      })
      continue
    }

    items.push({
      externalId: detailId ? `legistar-html:${detailId}` : `legistar-html:${matterFile}`,
      bodyName: null,
      matterTitle,
      matterType: cleanText(cells[1]),
      matterStatus: cleanText(cells[2]),
      matterFile,
      matterDate: normalizeDate(cleanText(cells[3])),
      sourceUrl,
      agendaNote: buildMatterNote([
        ['Introduced', cleanText(cells[3])],
        ['Final action', cleanText(cells[4])],
      ]),
    })
  }

  return dedupeItems(items)
}

function parseLAClerkRows(html: string, baseUrl: string): RawAgendaItem[] {
  const tableHtml = extractTableHtml(html, 'CFIResultList')
  if (!tableHtml) return []

  const bodyHtml = extractTableBody(tableHtml)
  if (!bodyHtml) return []

  const rows = Array.from(bodyHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) as RegExpMatchArray[]
  const items: RawAgendaItem[] = []

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1]
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1])
    if (cells.length < 3) continue

    const matterFile = cleanText(cells[0])
    const matterTitle = cleanText(cells[1])
    if (!matterFile || !matterTitle) continue

    const hrefMatch = rowHtml.match(/href="([^"]*cfnumber=[^"]*)"/i)
    const sourceUrl = hrefMatch ? resolveUrl(baseUrl, decodeHtml(hrefMatch[1])) : null
    const matterDate = normalizeDate(cleanText(cells[2]))

    items.push({
      externalId: `la:${matterFile}`,
      bodyName: 'City Council',
      matterTitle,
      matterType: 'Council File',
      matterStatus: null,
      matterFile,
      matterDate,
      sourceUrl,
      agendaNote: buildMatterNote([
        ['Last changed', cleanText(cells[2])],
      ]),
    })
  }

  return dedupeItems(items)
}

function mapChicagoElmsMatter(matter: ChicagoElmsMatter, detailBaseUrl: string): RawAgendaItem | null {
  const matterTitle = cleanText(matter.title)
  if (!matter.matterId || !matterTitle) return null

  const status = normalizeChicagoStatus(matter.status)

  return {
    externalId: `chicago-elms:${matter.matterId}`,
    bodyName: 'City Council',
    matterTitle,
    matterType: cleanText(matter.type),
    matterStatus: status,
    matterFile: cleanText(matter.recordNumber),
    matterDate: firstNonEmpty(
      normalizeDate(matter.lastPublicationDate),
      normalizeDate(matter.finalActionDate),
      normalizeDate(matter.introductionDate)
    ),
    sourceUrl: buildChicagoElmsMatterUrl(detailBaseUrl, matter.matterId),
    agendaNote: buildMatterNote([
      ['Committee', cleanText(matter.controllingBody)],
      ['Sponsor', cleanText(matter.filingSponsor)],
      ['Substatus', cleanText(matter.subStatus)],
      ['Introduced', formatDisplayDate(matter.introductionDate)],
      ['Final action', formatDisplayDate(matter.finalActionDate)],
      ['Published', formatDisplayDate(matter.lastPublicationDate)],
    ]),
  }
}

function extractEScribeMeetingLinks(html: string, baseUrl: string, keywords: string[]): string[] {
  const links: string[] = []

  for (const match of Array.from(html.matchAll(/<a\b[^>]*href=['"]([^'"]*Meeting\.aspx\?Id=[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi))) {
    const href = decodeHtml(match[1] ?? '')
    const text = cleanText(match[2]) ?? ''
    if (!text || text.toLowerCase() === 'html') continue
    if (!matchesKeyword(text, keywords)) continue
    links.push(resolveUrl(baseUrl, href))
  }

  return dedupeStrings(links)
}

function extractEScribeExpandedLinks(html: string, baseUrl: string, keywords: string[]): string[] {
  const links: string[] = []

  for (const match of Array.from(html.matchAll(/<a\b[^>]*href=['"]([^'"]*Expanded=[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi))) {
    const href = decodeHtml(match[1] ?? '')
    const text = cleanText(match[2]) ?? ''
    if (!text || !matchesKeyword(text, keywords)) continue
    links.push(resolveUrl(baseUrl, href))
  }

  return dedupeStrings(links)
}

function parseEScribeMeetingPage(
  html: string,
  meetingUrl: string
): { meetingDate: Date; items: RawAgendaItem[] } | null {
  const titleText = cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) ?? ''
  const meetingDate = parseEScribeMeetingDate(titleText)
  if (!meetingDate) return null

  const items: RawAgendaItem[] = []
  const meetingMatch = meetingUrl.match(/[?&]Id=([^&]+)/i)
  const meetingId = meetingMatch?.[1] ?? null

  for (const block of extractEScribeAgendaBlocks(html)) {
    if (!shouldIncludeEScribeAgendaBlock(block.title, block.headingLevel, block.description, block.attachmentUrls.length)) {
      continue
    }

    const sourceUrl = block.attachmentUrls[0] ?? buildEScribeMeetingItemUrl(meetingUrl, meetingId, block.itemId)
    items.push({
      externalId: `escribe:agenda:${meetingId ?? 'na'}:${block.itemId}`,
      bodyName: 'City Council',
      matterTitle: block.title,
      matterType: inferEScribeMatterType(block.title),
      matterStatus: null,
      matterFile: block.counter,
      matterDate: meetingDate.toISOString(),
      sourceUrl,
      agendaNote: firstNonEmpty(
        block.description,
        buildMatterNote([
          ['Meeting', formatDisplayDate(meetingDate.toISOString())],
          ['Item', block.counter],
        ])
      ),
    })
  }

  return {
    meetingDate,
    items,
  }
}

function extractEScribeAgendaBlocks(html: string): Array<{
  itemId: string
  counter: string | null
  title: string
  headingLevel: number
  description: string | null
  attachmentUrls: string[]
}> {
  const blocks: Array<{
    itemId: string
    counter: string | null
    title: string
    headingLevel: number
    description: string | null
    attachmentUrls: string[]
  }> = []

  for (const match of Array.from(html.matchAll(/<div class="AgendaItem AgendaItem(\d+)[^"]*"[^>]*>/gi))) {
    const itemId = match[1]
    const block = extractHtmlBlock(html, match.index ?? 0, 'div')
    if (!block) continue

    const headerText = cleanText(block.match(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/i)?.[2]) ?? ''
    const headingLevel = Number.parseInt(block.match(/<h([2-6])\b/i)?.[1] ?? '0', 10)
    const title = cleanText(block.match(/<div class="AgendaItemTitle"[^>]*><a [^>]*>([\s\S]*?)<\/a>/i)?.[1]) ?? ''
    if (!title || Number.isNaN(headingLevel)) continue

    const counter = headerText.startsWith(title)
      ? null
      : cleanText(headerText.replace(title, '')) ?? headerText.split(' ').slice(0, 1).join(' ')

    const descriptionBlock = extractSectionBlock(block, 'AgendaItemDescription')
    const attachmentBlock = extractSectionBlock(block, 'AgendaItemAttachmentsList')
    const attachmentUrls = Array.from(
      (attachmentBlock ?? '').matchAll(/<a\b[^>]*href="([^"]*FileStream\.ashx\?DocumentId=[^"]*)"[^>]*>/gi)
    ).map((attachmentMatch) => resolveUrl('https://pub-raleighnc.escribemeetings.com/', decodeHtml(attachmentMatch[1])))

    blocks.push({
      itemId,
      counter,
      title,
      headingLevel,
      description: cleanText(descriptionBlock),
      attachmentUrls,
    })
  }

  return blocks
}

function shouldIncludeEScribeAgendaBlock(
  title: string,
  headingLevel: number,
  description: string | null,
  attachmentCount: number
): boolean {
  if (headingLevel >= 4) return true

  const normalized = title.trim()
  const isSectionHeader = normalized === normalized.toUpperCase()
  if (headingLevel <= 2 && isSectionHeader) return false

  if (/^(Pledge of Allegiance|Voice Mail Public Comment|Public Comment)$/i.test(normalized)) {
    return false
  }

  return !isSectionHeader && (Boolean(description) || attachmentCount > 0)
}

function parseEScribeMeetingDate(titleText: string): Date | null {
  const match = titleText.match(/-\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4})$/)
  if (!match) return null

  const parsed = new Date(match[1])
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildEScribeMeetingItemUrl(meetingUrl: string, meetingId: string | null, itemId: string): string {
  if (!meetingId) return meetingUrl

  const url = new URL(meetingUrl)
  url.searchParams.set('Id', meetingId)
  url.searchParams.set('Item', itemId)
  url.searchParams.set('Agenda', 'Agenda')
  return url.toString()
}

function inferEScribeMatterType(title: string): string | null {
  const normalized = title.trim()
  const prefixes = [
    'Resolution',
    'Petition Annexation',
    'Rezoning',
    'Ordinance',
    'Contract',
    'Encroachment',
    'Easement',
    'Condemnation',
    'Interlocal Agreements',
    'Limited Obligation Bond Anticipation Note',
  ]

  const matchedPrefix = prefixes.find((prefix) => normalized.toLowerCase().startsWith(prefix.toLowerCase()))
  if (matchedPrefix) return matchedPrefix

  return null
}

function extractHtmlBlock(html: string, startIndex: number, tagName: string): string | null {
  const openTag = `<${tagName}`
  const closeTag = `</${tagName}>`
  let depth = 0
  let index = startIndex

  while (index < html.length) {
    const nextOpen = html.indexOf(openTag, index)
    const nextClose = html.indexOf(closeTag, index)

    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1
      index = nextOpen + openTag.length
      continue
    }

    depth -= 1
    index = nextClose + closeTag.length
    if (depth === 0) {
      return html.slice(startIndex, index)
    }
  }

  return null
}

function extractSectionBlock(html: string, className: string): string | null {
  const classIndex = html.indexOf(`class="${className}`)
  if (classIndex === -1) return null

  const divStart = html.lastIndexOf('<div', classIndex)
  if (divStart === -1) return null

  return extractHtmlBlock(html, divStart, 'div')
}

function matchesKeyword(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function extractTableHtml(html: string, tableId: string): string | null {
  const idIndex = html.indexOf(`id="${tableId}"`)
  if (idIndex === -1) return null

  const tableStart = html.lastIndexOf('<table', idIndex)
  const tableEnd = html.indexOf('</table>', idIndex)
  if (tableStart === -1 || tableEnd === -1) return null

  return html.slice(tableStart, tableEnd + '</table>'.length)
}

function extractTableBody(tableHtml: string): string | null {
  const match = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  return match?.[1] ?? null
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${url}`)
  }

  return res.text()
}

function mattersAreFresh(items: RawAgendaItem[], staleAfterDays: number): boolean {
  const latest = latestMatterDate(items)
  if (!latest) return false

  const latestTime = new Date(latest).getTime()
  if (Number.isNaN(latestTime)) return false

  const ageMs = Date.now() - latestTime
  return ageMs <= staleAfterDays * 24 * 60 * 60 * 1000
}

function latestMatterDate(items: Array<{ matterDate: string | null }>): string | null {
  const timestamps = items
    .map((item) => item.matterDate)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))

  if (!timestamps.length) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function providerLabel(provider: AgendaProvider): string {
  switch (provider.type) {
    case 'legistar-matters':
      return 'Legistar Matters API'
    case 'legistar-html':
      return 'Legistar legislation search'
    case 'chicago-elms':
      return 'Chicago Clerk eLMS API'
    case 'la-clerk-connect':
      return 'LA Clerk Connect'
    case 'escribe':
      return 'eScribe'
  }
}

function buildChicagoElmsMatterUrl(detailBaseUrl: string, matterId: string): string {
  const url = new URL('matter', ensureTrailingSlash(detailBaseUrl))
  url.searchParams.set('matterId', matterId)
  return url.toString()
}

function buildLegistarMatterUrl(detailBaseUrl: string | undefined, matter: LegistarMatter): string | null {
  if (!detailBaseUrl || !matter.MatterId) return null

  const url = new URL('LegislationDetail.aspx', ensureTrailingSlash(detailBaseUrl))
  url.searchParams.set('ID', String(matter.MatterId))

  if (matter.MatterGuid) {
    url.searchParams.set('GUID', matter.MatterGuid)
  }

  url.searchParams.set('Options', 'ID|Text|')
  url.searchParams.set('Search', '')

  return url.toString()
}

function getHiddenInputValue(html: string, name: string): string {
  const match = html.match(new RegExp(`name="${escapeRegExp(name)}"[^>]*value="([^"]*)"`, 'i'))
  return decodeHtml(match?.[1] ?? '')
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeDate(value: string | undefined | null): string | null {
  if (!value) return null
  const parsed = parseDate(value)
  return parsed?.toISOString() ?? null
}

function formatMonthDayYear(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}/${date.getFullYear()}`
}

function formatDisplayDate(value: string | undefined): string | null {
  const parsed = parseDate(value ?? null)
  if (!parsed) return null

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildMatterNote(entries: Array<[label: string, value: string | null]>): string | null {
  const parts = entries
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)

  return parts.length ? parts.join('\n') : null
}

function extractMatterNoteValue(note: string, label: string): string | null {
  const match = note.match(new RegExp(`(?:^|\\n)${escapeRegExp(label)}: ([^\\n]+)`))
  return match?.[1]?.trim() ?? null
}

function cleanText(value: string | undefined | null): string | null {
  if (!value) return null

  const stripped = decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()

  if (!stripped || stripped === '&nbsp;') return null
  return stripped
}

function normalizeText(value: string | undefined | null): string {
  return cleanText(value)?.toLowerCase() ?? ''
}

function dedupeItems(items: RawAgendaItem[]): RawAgendaItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.externalId)) return false
    seen.add(item.externalId)
    return true
  })
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

function resolveUrl(baseUrl: string, href: string): string {
  return new URL(href, baseUrl).toString()
}

function normalizeChicagoStatus(value: string | undefined | null): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  return cleaned.replace(/^\d+\s*-\s*/, '')
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstNonEmpty<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value
    }
  }

  return null
}

function isRawAgendaItem(value: RawAgendaItem | null): value is RawAgendaItem {
  return value !== null
}
