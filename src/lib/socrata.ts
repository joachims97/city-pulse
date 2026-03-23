/**
 * Typed wrapper for the Socrata SODA v2 API.
 * Works for any city — uses city.socrataHost and an optional per-city
 * app token env var (falls back to the generic SOCRATA_APP_TOKEN).
 */
import type { SocrataQueryParams } from '@/types/socrata'
import type { CityConfig } from '@/types/city'

export async function socrataFetch<T>(
  datasetId: string,
  query: SocrataQueryParams,
  city: CityConfig,
  hostOverride?: string   // for county-level data on a different Socrata host
): Promise<T[]> {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const host = hostOverride ?? city.socrataHost
  const url = `${host}/resource/${datasetId}.json?${params.toString()}`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }

  // City-specific token takes priority; generic token is the fallback
  const tokenEnvVar = city.socrataAppTokenEnv ?? 'SOCRATA_APP_TOKEN'
  const appToken = process.env[tokenEnvVar] ?? process.env.SOCRATA_APP_TOKEN
  if (appToken) {
    headers['X-App-Token'] = appToken
  }

  const res = await fetch(url, {
    headers,
    next: { revalidate: 0 }, // we handle caching ourselves
  })

  if (!res.ok) {
    throw new Error(`Socrata ${res.status}: ${url}`)
  }

  return res.json() as Promise<T[]>
}

export async function socrataFetchAll<T>(
  datasetId: string,
  query: SocrataQueryParams,
  city: CityConfig,
  hostOverride?: string,
  pageSize = 500,
  maxPages = 20
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await socrataFetch<T>(
      datasetId,
      {
        ...query,
        $limit: pageSize,
        $offset: page * pageSize,
      },
      city,
      hostOverride
    )

    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }
  }

  return rows
}

/** Format a date for Socrata $where clauses: 'YYYY-MM-DDT00:00:00.000' */
export function socrataDate(date: Date): string {
  return date.toISOString().replace('Z', '')
}

/** ISO date string N days ago */
export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return socrataDate(d)
}
