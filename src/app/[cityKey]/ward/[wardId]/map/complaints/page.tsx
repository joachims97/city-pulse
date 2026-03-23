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
      <div className="w-full px-4 py-4">
        <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
          <div>
            <h1 className="text-sm font-bold text-gray-900">
              {city.displayName} — {districtDisplayName} — 311 Map
            </h1>
          </div>
        </div>
        <div className="overflow-hidden border border-gray-300 bg-white">
          <EmptyState message="311 map data is temporarily unavailable." tone="error" />
        </div>
      </div>
    )
  }

  const mapComplaintCount = complaints.filter(
    (complaint) => typeof complaint.latitude === 'number' && typeof complaint.longitude === 'number'
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
        <span>311 Map</span>
      </div>

      <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
        <div>
          <h1 className="text-sm font-bold text-gray-900">
            {city.displayName} — {districtDisplayName} — 311 Map
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {getTimeWindowLabel(resolvedDays)} · {mapComplaintCount} mapped requests
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a href={`/${city.key}/ward/${wardId}/table/complaints?days=${resolvedDays}`} className="text-blue-700 hover:underline">
            Table view
          </a>
          <a href={`/${city.key}/ward/${wardId}`} className="text-blue-700 hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-300 bg-white">
        <div className="border-b border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
          311 Service Requests — {city.districtName} {districtLabel}
        </div>

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
