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
      <div className="page-shell space-y-6">
        <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="page-rail">
            <div className="page-kicker">Permits</div>
          </div>
          <div className="space-y-3">
            <h1 className="page-title max-w-[10ch]">{getDistrictDisplayName(city, wardId)}</h1>
            <p className="page-subtitle">Mapped permit activity.</p>
          </div>
        </section>
        <div className="panel panel-accent-yellow overflow-hidden">
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
    <div className="page-shell space-y-6">
      <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="page-rail">
          <div className="page-kicker">Permit Map</div>
          <div className="breadcrumbs">
            <a href="/">Home</a>
            <span className="breadcrumbs-sep">/</span>
            <a href={`/${city.key}`}>{city.displayName}</a>
            <span className="breadcrumbs-sep">/</span>
            <a href={`/${city.key}/ward/${wardId}`}>{districtDisplayName}</a>
            <span className="breadcrumbs-sep">/</span>
            <span>Map</span>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="page-title max-w-[10ch]">Permit map</h1>
          <p className="page-subtitle">{getTimeWindowLabel(resolvedDays)} - {mapPermitCount} mapped permits.</p>
          <div>
            <a href={`/${city.key}/ward/${wardId}/table/permits?days=${resolvedDays}`} className="action-link action-link-route">
              Open table view
            </a>
          </div>
        </div>
      </section>

      <div className="panel panel-accent-yellow overflow-hidden">
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
