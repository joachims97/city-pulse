import { getCached } from '@/lib/cache'
import { socrataFetch } from '@/lib/socrata'
import { CACHE_TTL } from '@/config/app'
import type { CityConfig, PdfBudgetProvider } from '@/types/city'
import { isPdfBudgetProvider } from '@/types/city'
import type { BudgetRaw } from '@/types/socrata'

export interface DepartmentBudget {
  department: string
  amount: number
  prevYearAmount: number | null
  percentChange: number | null
}

export interface BudgetSummary {
  fiscalYear: number
  totalBudget: number
  departments: DepartmentBudget[]
  topDepartments: DepartmentBudget[]
  updatedAt: string
}

const pdfTextCache = new Map<string, string>()

export async function getBudget(
  city: CityConfig,
  fiscalYear = new Date().getFullYear()
): Promise<BudgetSummary> {
  const cacheKey = `${city.key}:budget:${fiscalYear}`

  return getCached(
    cacheKey,
    city.key,
    'budget',
    () => fetchBudget(city, fiscalYear),
    CACHE_TTL.budget
  )
}

async function fetchBudget(city: CityConfig, fiscalYear: number): Promise<BudgetSummary> {
  if (city.key === 'philadelphia') {
    return fetchPhiladelphiaBudget(fiscalYear)
  }

  if (isPdfBudgetProvider(city.datasets.budget)) {
    return fetchPdfBudget(city.datasets.budget, fiscalYear)
  }

  const f = city.fields
  const deptCol = f.budgetDepartment ?? 'department_description'
  const amountCol = f.budgetAmount ?? 'budgeted_amount'
  const snapshotCol = f.budgetSnapshotDate

  // Build list of datasets to try: primary + alts
  const datasetIds: string[] = []
  if (typeof city.datasets.budget === 'string') datasetIds.push(city.datasets.budget)
  if (city.datasets.budgetAlts) datasetIds.push(...city.datasets.budgetAlts)

  if (datasetIds.length === 0) {
    throw new Error(`Budget dataset not configured for ${city.key}`)
  }

  const yearCol = f.budgetFiscalYear

  // Try current year, then prior year (some cities publish on a lag)
  const yearsToTry = yearCol ? [fiscalYear, fiscalYear - 1] : [fiscalYear]

  for (const datasetId of datasetIds) {
    for (const year of yearsToTry) {
      try {
        const whereClauses: string[] = []
        if (yearCol) {
          whereClauses.push(`${yearCol}='${year}'`)
        }

        if (snapshotCol) {
          const latestSnapshot = await getLatestBudgetSnapshot(datasetId, city, snapshotCol, whereClauses)
          if (latestSnapshot) {
            whereClauses.push(`${snapshotCol}='${latestSnapshot}'`)
          }
        }

        const query: Record<string, string | number> = {
          $select: `${deptCol},SUM(${amountCol}) as total`,
          $group: deptCol,
          $order: 'total DESC',
          $limit: 500,
        }
        if (whereClauses.length) {
          query.$where = whereClauses.join(' AND ')
        }

        const raw = await socrataFetch<BudgetRaw>(datasetId, query, city)

        if (raw.length > 0) {
          const departments: DepartmentBudget[] = raw
            .filter((r) => (r as Record<string, string>)[deptCol])
            .map((r) => {
              const row = r as Record<string, string>
              return {
                department: row[deptCol]!,
                amount: parseFloat(row['total'] ?? row[amountCol] ?? '0'),
                prevYearAmount: null,
                percentChange: null,
              }
            })
            .filter((d) => d.amount > 0)

          const totalBudget = departments.reduce((sum, d) => sum + d.amount, 0)

          return {
            fiscalYear: year,
            totalBudget,
            departments,
            topDepartments: departments.slice(0, 5),
            updatedAt: new Date().toISOString(),
          }
        }
      } catch {
        // Try next
      }
    }
  }

  throw new Error(`Failed to load budget data for ${city.key}`)
}

async function fetchPdfBudget(
  provider: PdfBudgetProvider,
  fiscalYear: number
): Promise<BudgetSummary> {
  try {
    const text = await extractPdfText(provider.url)

    switch (provider.parser) {
      case 'charlotte-adopted-fy2026':
        return parseCharlotteBudget(text, provider.fiscalYear)
      case 'raleigh-adopted-fy2026':
        return parseRaleighBudget(text, provider.fiscalYear)
      default:
        throw new Error(`Unsupported PDF budget parser: ${provider.parser}`)
    }
  } catch {
    throw new Error(`Failed to load PDF budget data for FY${provider.fiscalYear ?? fiscalYear}`)
  }
}

async function getLatestBudgetSnapshot(
  datasetId: string,
  city: CityConfig,
  snapshotCol: string,
  whereClauses: string[]
): Promise<string | null> {
  try {
    const query: Record<string, string | number> = {
      $select: `MAX(${snapshotCol}) as latest`,
      $limit: 1,
    }

    if (whereClauses.length) {
      query.$where = whereClauses.join(' AND ')
    }

    const rows = await socrataFetch<Array<{ latest?: string }>[number]>(datasetId, query, city)
    return rows[0]?.latest ?? null
  } catch {
    return null
  }
}

interface PhiladelphiaDocument {
  title?: string
  url?: string
  date?: string
  modified?: string
}

interface PhiladelphiaDocumentGroup {
  title?: string
  documents?: PhiladelphiaDocument[]
}

async function fetchPhiladelphiaBudget(fiscalYear: number): Promise<BudgetSummary> {
  try {
    const books = await getPhiladelphiaBudgetBooks(fiscalYear)
    if (!books.book1 || !books.book2) {
      throw new Error(`Philadelphia budget books unavailable for FY${fiscalYear}`)
    }

    const departments = await parsePhiladelphiaBudgetDepartments(books.book1.url!, books.book2.url!)
    if (departments.length === 0) {
      throw new Error(`Philadelphia budget rows unavailable for FY${books.fiscalYear}`)
    }

    const totalBudget = departments.reduce((sum, dept) => sum + dept.amount, 0)

    return {
      fiscalYear: books.fiscalYear,
      totalBudget,
      departments,
      topDepartments: departments.slice(0, 5),
      updatedAt: new Date().toISOString(),
    }
  } catch {
    throw new Error(`Failed to load Philadelphia budget data for FY${fiscalYear}`)
  }
}

async function getPhiladelphiaBudgetBooks(
  fiscalYear: number
): Promise<{ fiscalYear: number; book1: PhiladelphiaDocument | null; book2: PhiladelphiaDocument | null }> {
  const res = await fetch('https://api.phila.gov/phila/document-finder/v1/151831', {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CityPulse/1.0',
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`Philadelphia document API ${res.status}`)

  const groups = await res.json() as PhiladelphiaDocumentGroup[]
  const operatingBudgetGroup = groups.find((group) => group.title === 'Operating Budget Detail')
  const documents = operatingBudgetGroup?.documents ?? []

  const exactBooks = pickPhiladelphiaBooks(documents, fiscalYear)
  if (exactBooks.book1 && exactBooks.book2) {
    return { fiscalYear, ...exactBooks }
  }

  const latestYear = findLatestPhiladelphiaAdoptedFiscalYear(documents)
  if (latestYear) {
    const latestBooks = pickPhiladelphiaBooks(documents, latestYear)
    if (latestBooks.book1 && latestBooks.book2) {
      return { fiscalYear: latestYear, ...latestBooks }
    }
  }

  return { fiscalYear, book1: null, book2: null }
}

function pickPhiladelphiaBooks(
  documents: PhiladelphiaDocument[],
  fiscalYear: number
): { book1: PhiladelphiaDocument | null; book2: PhiladelphiaDocument | null } {
  const adopted = documents.filter((doc) => {
    const title = doc.title ?? ''
    return title.includes(`FY${fiscalYear}`) && title.includes('Adopted')
  })

  const byModifiedDesc = [...adopted].sort(
    (a, b) => Number(b.modified ?? 0) - Number(a.modified ?? 0)
  )

  return {
    book1: byModifiedDesc.find((doc) => /\bBook I\b/.test(doc.title ?? '')) ?? null,
    book2: byModifiedDesc.find((doc) => /\bBook II\b/.test(doc.title ?? '')) ?? null,
  }
}

function findLatestPhiladelphiaAdoptedFiscalYear(documents: PhiladelphiaDocument[]): number | null {
  const years = documents
    .map((doc) => {
      const match = doc.title?.match(/FY(\d{4})/)
      return match ? parseInt(match[1], 10) : null
    })
    .filter((year): year is number => year !== null)
    .sort((a, b) => b - a)

  return years[0] ?? null
}

async function parsePhiladelphiaBudgetDepartments(
  book1Url: string,
  book2Url: string
): Promise<DepartmentBudget[]> {
  const [book1Text, book2Text] = await Promise.all([
    extractPhiladelphiaBudgetText(book1Url),
    extractPhiladelphiaBudgetText(book2Url),
  ])

  const sectionNames = parsePhiladelphiaSectionNames(book1Text)
  const friendlyNames = {
    ...parsePhiladelphiaPageNames(book1Text),
    ...parsePhiladelphiaPageNames(book2Text),
  }

  const departments = [
    ...parsePhiladelphiaBudgetPages(book1Text, sectionNames, friendlyNames),
    ...parsePhiladelphiaBudgetPages(book2Text, sectionNames, friendlyNames),
  ]

  return departments
    .filter((dept) => dept.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

async function extractPhiladelphiaBudgetText(url: string): Promise<string> {
  return extractPdfText(url)
}

async function extractPdfText(url: string): Promise<string> {
  if (pdfTextCache.has(url)) return pdfTextCache.get(url)!

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CityPulse/1.0' },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    throw new Error(`Budget PDF fetch failed: ${res.status}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buffer)
  const text = result.text ?? ''
  pdfTextCache.set(url, text)
  return text
}

function parsePhiladelphiaSectionNames(text: string): Record<number, string> {
  const names: Record<number, string> = {}

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').trim()
    const match = line.match(/^(.*?)\s+(I|II)\s+(\d+)$/)
    if (!match) continue
    names[parseInt(match[3], 10)] = formatPhiladelphiaDepartmentName(match[1])
  }

  return names
}

function parsePhiladelphiaPageNames(text: string): Record<number, string> {
  const pages = splitPhiladelphiaBudgetPages(text)
  const names: Record<number, string> = {}

  for (const page of pages) {
    if (!page.includes('71-53A (Program Based Budgeting Version)')) continue
    const sectionMatch = page.match(/SECTION\s+(\d+)\s+1/)
    if (!sectionMatch) continue

    const lines = page
      .split('\n')
      .map((line) => line.replace(/\t/g, ' ').trim())
      .filter(Boolean)
    const idx = lines.findIndex((line) => line.includes('Department No.'))
    if (idx < 0 || !lines[idx + 1]) continue

    names[parseInt(sectionMatch[1], 10)] = formatPhiladelphiaDepartmentName(
      lines[idx + 1].replace(/\s+\d{2,}$/, '').trim()
    )
  }

  return names
}

function parsePhiladelphiaBudgetPages(
  text: string,
  sectionNames: Record<number, string>,
  friendlyNames: Record<number, string>
): DepartmentBudget[] {
  const pages = splitPhiladelphiaBudgetPages(text)
  const departments: DepartmentBudget[] = []

  for (const page of pages) {
    if (!page.includes('71-53B (Program Based Budgeting Version)')) continue

    const sectionMatch = page.match(/SECTION\s+(\d+)\s+2/)
    if (!sectionMatch) continue
    const section = parseInt(sectionMatch[1], 10)

    const totalLine = page
      .split('\n')
      .map((line) => line.replace(/\t/g, ' ').trim())
      .filter((line) => line.startsWith('Total') && /\d/.test(line))
      .pop()

    const adoptedAmount = totalLine ? extractPhiladelphiaAdoptedAmount(totalLine) : null
    if (adoptedAmount === null) continue

    departments.push({
      department: friendlyNames[section] ?? sectionNames[section] ?? `Section ${section}`,
      amount: adoptedAmount,
      prevYearAmount: null,
      percentChange: null,
    })
  }

  return departments
}

function splitPhiladelphiaBudgetPages(text: string): string[] {
  return text.split(/--\s+\d+\s+of\s+\d+\s+--/g)
}

function extractPhiladelphiaAdoptedAmount(totalLine: string): number | null {
  const beforeParen = totalLine.split('(')[0]
  const values = (beforeParen.match(/[\d,]+/g) ?? []).map((value) =>
    parseInt(value.replace(/,/g, ''), 10)
  )

  if (values.length === 0) return null
  if (totalLine.includes('(')) return values[values.length - 1] ?? null
  if (values.length >= 5) return values[values.length - 2] ?? null
  return values[values.length - 1] ?? null
}

function formatPhiladelphiaDepartmentName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCharlotteBudget(text: string, fiscalYear: number): BudgetSummary {
  const categories = [
    extractMillionsCategory(text, 'Aviation', /Aviation\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'General Fund', /General Fund\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'Charlotte Water', /Charlotte\s+Water\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'Internal Service and Special Revenue', /Internal Service and Special\s+Revenue,\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'CATS', /CATS,\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'Storm Water Services', /Storm Water Services,\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'General CIP', /General CIP,\s*\$([\d.]+)/),
    extractMillionsCategory(text, 'General Debt/Interest', /General Debt\/Interest,\s*\$([\d.]+)/),
  ].filter((department): department is DepartmentBudget => department !== null)

  const totalBudget = categories.reduce((sum, category) => sum + category.amount, 0)

  return {
    fiscalYear,
    totalBudget,
    departments: categories.sort((a, b) => b.amount - a.amount),
    topDepartments: categories.slice(0, 5),
    updatedAt: new Date().toISOString(),
  }
}

function parseRaleighBudget(text: string, fiscalYear: number): BudgetSummary {
  const totalMatch = text.match(/total \$([\d,]+)\./i)
  const totalBudget = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0

  const categories = [
    extractAbsoluteCategory(text, 'General Fund', /General Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Public Utilities Fund', /Public Utilities Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Raleigh Water Capital Projects', /RW Consolidated Capital Projects Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'General Debt Service Fund', /General Debt Service Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Public Transit Fund', /Public Transit Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Solid Waste Fund', /Solid Waste Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Convention Center Financing Fund', /Convention Center Financing Fund Revenue Total\s+\$?([\d,]+)/),
    extractAbsoluteCategory(text, 'Stormwater Management Fund', /Stormwater Management Fund Revenue Total\s+\$?([\d,]+)/),
  ].filter((department): department is DepartmentBudget => department !== null)

  const categoryTotal = categories.reduce((sum, category) => sum + category.amount, 0)
  if (totalBudget > categoryTotal) {
    categories.push({
      department: 'Capital, Debt, and Other Funds',
      amount: totalBudget - categoryTotal,
      prevYearAmount: null,
      percentChange: null,
    })
  }

  const sorted = categories.sort((a, b) => b.amount - a.amount)

  return {
    fiscalYear,
    totalBudget,
    departments: sorted,
    topDepartments: sorted.slice(0, 5),
    updatedAt: new Date().toISOString(),
  }
}

function extractMillionsCategory(
  text: string,
  department: string,
  pattern: RegExp
): DepartmentBudget | null {
  const match = text.match(pattern)
  if (!match) return null

  return {
    department,
    amount: Math.round(Number.parseFloat(match[1]) * 1_000_000),
    prevYearAmount: null,
    percentChange: null,
  }
}

function extractAbsoluteCategory(
  text: string,
  department: string,
  pattern: RegExp
): DepartmentBudget | null {
  const match = text.match(pattern)
  if (!match) return null

  return {
    department,
    amount: Number(match[1].replace(/,/g, '')),
    prevYearAmount: null,
    percentChange: null,
  }
}

function emptyBudget(fiscalYear: number): BudgetSummary {
  return {
    fiscalYear,
    totalBudget: 0,
    departments: [],
    topDepartments: [],
    updatedAt: new Date().toISOString(),
  }
}
