import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName, getDistrictLabel } from '@/lib/districts'
import { getPermits } from '@/services/permitsService'
import PermitMapExplorer from '@/components/map/PermitMapExplorer'
import EmptyState from '@/components/ui/EmptyState'

interface Props {
  params: {
    cityKey: string
    wardId: string
  }
  searchParams: {
    days?: string
  }
}

function getTimeWindowLabel(days: number) {
  return `Last ${Math.round(days / 30)} months`
}

export async function generateMetadata({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId)) {
    return { title: 'Not Found — CityPulse' }
  }

  const days = parseInt(searchParams.days ?? '180', 10)
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return {
    title: `${city.displayName} ${districtDisplayName} Permit Map`,
    description: `Mapped building permits for ${city.displayName} ${districtDisplayName}, ${getTimeWindowLabel(Number.isNaN(days) ? 180 : days)}.`,
  }
}

export default async function WardPermitMapPage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const days = parseInt(searchParams.days ?? '180', 10)
  const resolvedDays = Number.isNaN(days) ? 180 : days
  let rawPermits

  try {
    rawPermits = await getPermits(wardId, city, resolvedDays, 'full')
  } catch {
    return (
      <div className="w-full px-4 py-4">
        <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
          <div>
            <h1 className="text-sm font-bold text-gray-900">
              {city.displayName} — {getDistrictDisplayName(city, wardId)} — Permit Map
            </h1>
          </div>
        </div>
        <div className="overflow-hidden border border-gray-300 bg-white">
          <EmptyState message="Permit map data is temporarily unavailable." tone="error" />
        </div>
      </div>
    )
  }

  const largePermits = rawPermits.filter((permit) => permit.isLargeDevelopment)
  const regularPermits = rawPermits.filter((permit) => !permit.isLargeDevelopment)
  const permits = [...largePermits, ...regularPermits]
  const districtDisplayName = getDistrictDisplayName(city, wardId)
  const districtLabel = getDistrictLabel(city, wardId)
  const mapPermitCount = permits.filter(
    (permit) => typeof permit.latitude === 'number' && typeof permit.longitude === 'number'
  ).length

  return (
    <div className="w-full px-4 py-4">
      <div className="mb-3 text-xs text-gray-500">
        <a href="/" className="text-blue-700 hover:underline">Home</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}`} className="text-blue-700 hover:underline">{city.displayName}</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}/ward/${wardId}`} className="text-blue-700 hover:underline">{districtDisplayName}</a>
        <span className="mx-1.5">›</span>
        <span>Permit Map</span>
      </div>

      <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
        <div>
          <h1 className="text-sm font-bold text-gray-900">
            {city.displayName} — {districtDisplayName} — Permit Map
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {getTimeWindowLabel(resolvedDays)} · {mapPermitCount} mapped permits
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a href={`/${city.key}/ward/${wardId}/table/permits?days=${resolvedDays}`} className="text-blue-700 hover:underline">
            Table view
          </a>
          <a href={`/${city.key}/ward/${wardId}`} className="text-blue-700 hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-300 bg-white">
        <div className="border-b border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
          Building Permits — {city.districtName} {districtLabel}
        </div>

        <PermitMapExplorer
          cityKey={city.key}
          districtName={city.districtName}
          districtLabel={districtLabel}
          wardId={wardId}
          permits={permits}
        />
      </div>
    </div>
  )
}
