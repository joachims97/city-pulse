import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName, getDistrictLabel } from '@/lib/districts'
import { getInspections } from '@/services/inspectionsService'
import InspectionMapExplorer from '@/components/map/InspectionMapExplorer'
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

  const days = parseInt(searchParams.days ?? '365', 10)
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return {
    title: `${city.displayName} ${districtDisplayName} Inspection Map`,
    description: `Mapped inspections for ${city.displayName} ${districtDisplayName}, ${getTimeWindowLabel(Number.isNaN(days) ? 365 : days)}.`,
  }
}

export default async function WardInspectionMapPage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const days = parseInt(searchParams.days ?? '365', 10)
  const resolvedDays = Number.isNaN(days) ? 365 : days
  let rawInspections

  try {
    rawInspections = await getInspections(wardId, city, resolvedDays, 'full')
  } catch {
    return (
      <div className="w-full px-4 py-4">
        <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
          <div>
            <h1 className="text-sm font-bold text-gray-900">
              {city.displayName} — {getDistrictDisplayName(city, wardId)} — Inspection Map
            </h1>
          </div>
        </div>
        <div className="overflow-hidden border border-gray-300 bg-white">
          <EmptyState message="Inspection map data is temporarily unavailable." tone="error" />
        </div>
      </div>
    )
  }

  const recentFails = rawInspections.filter((inspection) => inspection.isRecentFail)
  const otherFails = rawInspections.filter((inspection) => inspection.isFailed && !inspection.isRecentFail)
  const regularInspections = rawInspections.filter((inspection) => !inspection.isFailed)
  const inspections = [...recentFails, ...otherFails, ...regularInspections]
  const districtDisplayName = getDistrictDisplayName(city, wardId)
  const districtLabel = getDistrictLabel(city, wardId)
  const mapInspectionCount = inspections.filter(
    (inspection) => typeof inspection.latitude === 'number' && typeof inspection.longitude === 'number'
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
        <span>Inspection Map</span>
      </div>

      <div className="mb-4 flex items-center justify-between border border-gray-300 px-3 py-2">
        <div>
          <h1 className="text-sm font-bold text-gray-900">
            {city.displayName} — {districtDisplayName} — Inspection Map
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {getTimeWindowLabel(resolvedDays)} · {mapInspectionCount} mapped inspections
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a href={`/${city.key}/ward/${wardId}/table/inspections?days=${resolvedDays}`} className="text-blue-700 hover:underline">
            Table view
          </a>
          <a href={`/${city.key}/ward/${wardId}`} className="text-blue-700 hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-300 bg-white">
        <div className="border-b border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
          Inspections — {city.districtName} {districtLabel}
        </div>

        <InspectionMapExplorer
          cityKey={city.key}
          districtName={city.districtName}
          districtLabel={districtLabel}
          wardId={wardId}
          inspections={inspections}
        />
      </div>
    </div>
  )
}
