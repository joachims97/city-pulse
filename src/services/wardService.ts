/**
 * Ward representative lookup — Prisma DB with Socrata fallback,
 * then static data for cities without a live dataset.
 */
import { prisma } from '@/lib/prisma'
import { getCached } from '@/lib/cache'
import { arcgisQuery } from '@/lib/arcgis'
import { getDistrictDisplayName, parseDistrictId } from '@/lib/districts'
import { socrataFetch } from '@/lib/socrata'
import { CACHE_TTL } from '@/config/app'
import type { CityConfig } from '@/types/city'
import { isArcGISLayerSource } from '@/types/city'
import { SF_REPS } from '@/config/cities/sf'
import { PHILLY_REPS } from '@/config/cities/philadelphia'
import { LA_REPS } from '@/config/cities/la'

const STATIC_REPS: Record<string, Record<number, { name: string; phone: string | null; website: string | null }>> = {
  sf: SF_REPS,
  philadelphia: PHILLY_REPS,
  la: LA_REPS,
}

export interface RepresentativeData {
  wardId: number
  cityKey: string
  name: string
  title: string
  phone: string | null
  email: string | null
  website: string | null
  officeAddr: string | null
  photoUrl: string | null
  party: string | null
  attendancePercent: number | null
  topDonors: { name: string; amount: number }[]
  nextElection: string | null
  updatedAt: Date
}

export async function getRepresentative(
  wardId: number,
  city: CityConfig
): Promise<RepresentativeData> {
  const cacheKey = `${city.key}:representative:v3:${wardId}`

  return getCached(
    cacheKey,
    city.key,
    'representative',
    () => fetchRepresentative(wardId, city),
    CACHE_TTL.representative
  )
}

async function fetchRepresentative(
  wardId: number,
  city: CityConfig
): Promise<RepresentativeData> {
  const cityKey = city.key
  const districtName = city.districtName

  // Check DB first
  try {
    const existing = await prisma.representative.findUnique({
      where: { cityKey_wardId: { cityKey, wardId } },
    })
    if (existing) {
      return {
        wardId: existing.wardId,
        cityKey: existing.cityKey,
        name: existing.name,
        title: existing.title,
        phone: existing.phone,
        email: existing.email,
        website: existing.website,
        officeAddr: existing.officeAddr,
        photoUrl: existing.photoUrl,
        party: existing.party,
        attendancePercent: null,
        topDonors: [],
        nextElection: null,
        updatedAt: existing.updatedAt,
      }
    }
  } catch {
    // DB not available
  }

  if (city.datasets.representatives && isArcGISLayerSource(city.datasets.representatives)) {
    try {
      const f = city.fields
      const districtCol = f.repDistrict ?? f.boundaryDistrict ?? f.districtCol ?? 'ward'
      const features = await arcgisQuery<Record<string, unknown>>(city.datasets.representatives, {
        outFields: uniqueFields([
          districtCol,
          f.repName,
          f.repPhone,
          f.repEmail,
          f.repAddress,
          f.repWebsite,
          f.repPhoto,
        ]),
        returnGeometry: false,
      })

      const match = features.find((feature) => parseDistrictId(city, feature.attributes[districtCol]) === wardId)
      if (match) {
        const attrs = match.attributes
        const rep: RepresentativeData = {
          wardId,
          cityKey,
          name: String(attrs[f.repName ?? 'name'] ?? getDistrictDisplayName(city, wardId)),
          title: districtName === 'Ward' ? 'Alderperson' : `${districtName} Representative`,
          phone: stringOrNull(attrs[f.repPhone ?? 'phone']),
          email: stringOrNull(attrs[f.repEmail ?? 'email']),
          website: stringOrNull(attrs[f.repWebsite ?? 'website']),
          officeAddr: stringOrNull(attrs[f.repAddress ?? 'address']),
          photoUrl: stringOrNull(attrs[f.repPhoto ?? 'photo']),
          party: null,
          attendancePercent: null,
          topDonors: [],
          nextElection: null,
          updatedAt: new Date(),
        }

        return rep
      }
    } catch (err) {
      console.warn('[WardService] ArcGIS fetch failed:', err)
    }
  }

  // Try Socrata representatives dataset if configured
  if (city.datasets.representatives && typeof city.datasets.representatives === 'string') {
    try {
      const f = city.fields
      const districtCol = f.repDistrict ?? f.districtCol ?? 'ward'

      // Try numeric comparison first (works for number columns), then string
      let results = await socrataFetch<Record<string, unknown>>(
        city.datasets.representatives,
        { $where: `${districtCol}=${wardId}`, $limit: 1 },
        city
      )
      if (results.length === 0) {
        results = await socrataFetch<Record<string, unknown>>(
          city.datasets.representatives,
          { $where: `${districtCol}='${wardId}'`, $limit: 1 },
          city
        )
      }

      if (results.length > 0) {
        const r = results[0] as Record<string, unknown>

        // Name: handle "Last, First" format
        const nameCol = f.repName ?? 'name'
        const rawName = String(r[nameCol] ?? '')
        const name = rawName.includes(',')
          ? rawName.split(',').map((s) => s.trim()).reverse().join(' ')
          : (rawName || `${getDistrictDisplayName(city, wardId)} Representative`)

        // Website: may be a Socrata URL object or a plain string
        const websiteRaw = r[f.repWebsite ?? 'website']
        const website = typeof websiteRaw === 'object' && websiteRaw !== null
          ? ((websiteRaw as Record<string, string>).url ?? null)
          : ((websiteRaw as string) ?? null)

        // Photo: may be a Socrata URL object
        const photoRaw = r[f.repPhoto ?? 'photo_link']
        const photoUrl = typeof photoRaw === 'object' && photoRaw !== null
          ? ((photoRaw as Record<string, string>).url ?? null)
          : ((photoRaw as string) ?? null)

        // Phone
        const phoneCol = f.repPhone ?? 'phone'
        const phone = String(r[phoneCol] ?? r['phone'] ?? '') || null

        // Address: prefer repAddress column, fallback to address
        const addrCol = f.repAddress ?? 'address'
        const officeAddr = r[addrCol] ? String(r[addrCol]) : null

        const rep: RepresentativeData = {
          wardId,
          cityKey,
          name,
          title: districtName === 'Ward' ? 'Alderperson' : `${districtName} Representative`,
          phone,
          email: r[f.repEmail ?? 'email'] ? String(r[f.repEmail ?? 'email']) : null,
          website,
          officeAddr,
          photoUrl,
          party: null,
          attendancePercent: null,
          topDonors: [],
          nextElection: null,
          updatedAt: new Date(),
        }

        // Persist to DB
        try {
          await prisma.representative.upsert({
            where: { cityKey_wardId: { cityKey, wardId } },
            update: { name: rep.name, phone: rep.phone, email: rep.email, website: rep.website, officeAddr: rep.officeAddr, photoUrl: rep.photoUrl },
            create: {
              wardId,
              cityKey,
              name: rep.name,
              title: rep.title,
              phone: rep.phone,
              email: rep.email,
              website: rep.website,
              officeAddr: rep.officeAddr,
              photoUrl: rep.photoUrl,
              party: rep.party,
            },
          })
        } catch { /* non-fatal */ }

        return rep
      }
    } catch (err) {
      console.warn('[WardService] Socrata fetch failed:', err)
    }
  }

  // Static data fallback for cities without a Socrata rep dataset
  const staticCity = STATIC_REPS[cityKey]
  if (staticCity?.[wardId]) {
    const s = staticCity[wardId]
    return {
      wardId,
      cityKey,
      name: s.name,
      title: `${districtName} Representative`,
      phone: s.phone,
      email: null,
      website: s.website,
      officeAddr: null,
      photoUrl: null,
      party: null,
      attendancePercent: null,
      topDonors: [],
      nextElection: null,
      updatedAt: new Date(),
    }
  }

  // Generic fallback
  return {
    wardId,
    cityKey,
    name: `${getDistrictDisplayName(city, wardId)} Representative`,
    title: districtName === 'Ward' ? 'Alderperson' : `${districtName} Representative`,
    phone: null,
    email: null,
    website: null,
    officeAddr: null,
    photoUrl: null,
    party: null,
    attendancePercent: null,
    topDonors: [],
    nextElection: null,
    updatedAt: new Date(),
  }
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function uniqueFields(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}
