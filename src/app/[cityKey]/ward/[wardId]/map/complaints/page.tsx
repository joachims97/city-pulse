import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName, getDistrictLabel } from '@/lib/districts'
import { getComplaints } from '@/services/complaintsService'
import ComplaintMapExplorer from '@/components/map/ComplaintMapExplorer'
import EmptyState from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

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
  return days === 365 ? 'Last 12 months' : `Last ${days} days`
}

export async function generateMetadata({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId)) {
    return { title: 'Not Found — CityPulse' }
  }

  const defaultDays = city.key === 'la' ? 365 : 90
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return {
    title: `${city.displayName} ${districtDisplayName} 311 Map`,
    description: `Mapped 311 service requests for ${city.displayName} ${districtDisplayName}, ${getTimeWindowLabel(Number.isNaN(days) ? defaultDays : days)}.`,
  }
}

export default async function WardComplaintMapPage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const defaultDays = city.key === 'la' ? 365 : 90
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const resolvedDays = Number.isNaN(days) ? defaultDays : days
  const districtDisplayName = getDistrictDisplayName(city, wardId)
  const districtLabel = getDistrictLabel(city, wardId)
  let complaints

  try {
    const data = await getComplaints(wardId, city, resolvedDays, 'full')
    complaints = data.complaints
  } catch {
    return (
      <div className="page-shell space-y-6">
        <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="page-rail">
            <div className="page-kicker">311 Map</div>
          </div>
          <div className="space-y-3">
            <h1 className="page-title max-w-[10ch]">{districtDisplayName}</h1>
            <p className="page-subtitle">Mapped 311 service requests.</p>
          </div>
        </section>
        <div className="panel panel-accent-red overflow-hidden">
          <EmptyState message="311 map data is temporarily unavailable." tone="error" />
        </div>
      </div>
    )
  }

  const mapComplaintCount = complaints.filter(
    (complaint) => typeof complaint.latitude === 'number' && typeof complaint.longitude === 'number'
  ).length

  return (
    <div className="page-shell space-y-6">
      <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="page-rail">
          <div className="page-kicker">311 Map</div>
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
          <h1 className="page-title max-w-[10ch]">311 request map</h1>
          <p className="page-subtitle">{getTimeWindowLabel(resolvedDays)} - {mapComplaintCount} mapped requests.</p>
          <div>
            <a href={`/${city.key}/ward/${wardId}/table/complaints?days=${resolvedDays}`} className="action-link action-link-route">
              Open table view
            </a>
          </div>
        </div>
      </section>

      <div className="panel panel-accent-red overflow-hidden">
        <ComplaintMapExplorer
          cityKey={city.key}
          districtName={city.districtName}
          districtLabel={districtLabel}
          wardId={wardId}
          complaints={complaints}
        />
      </div>
    </div>
  )
}
