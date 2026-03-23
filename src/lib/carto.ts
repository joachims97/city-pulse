export interface CartoSqlResponse<T> {
  rows: T[]
}

export async function cartoSqlFetch<T>(
  sql: string,
  host = 'https://phl.carto.com'
): Promise<T[]> {
  const url = new URL('/api/v2/sql', host)
  url.searchParams.set('q', sql)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CityPulse/1.0',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Carto ${res.status}: ${url}`)
  }

  const data = await res.json() as CartoSqlResponse<T>
  return data.rows
}

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}
