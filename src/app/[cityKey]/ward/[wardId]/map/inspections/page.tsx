import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName, getDistrictLabel } from '@/lib/districts'
import { getInspectionDefaultDays, getInspectionTimeWindowLabel } from '@/lib/inspectionWindow'
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

export async function generateMetadata({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId)) {
    return { title: 'Not Found — CityPulse' }
  }

  const defaultDays = getInspectionDefaultDays(city.key)
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return {
    title: `${city.displayName} ${districtDisplayName} Inspection Map`,
    description: `Mapped inspections for ${city.displayName} ${districtDisplayName}, ${getInspectionTimeWindowLabel(Number.isNaN(days) ? defaultDays : days)}.`,
  }
}

export default async function WardInspectionMapPage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const defaultDays = getInspectionDefaultDays(city.key)
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const resolvedDays = Number.isNaN(days) ? defaultDays : days
  let rawInspections

  try {
    rawInspections = await getInspections(wardId, city, resolvedDays, 'full')
  } catch {
    return (
      <div className="page-shell space-y-6">
        <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="page-rail">
            <div className="page-kicker">Inspections</div>
          </div>
          <div className="space-y-3">
            <h1 className="page-title max-w-[10ch]">{getDistrictDisplayName(city, wardId)}</h1>
            <p className="page-subtitle">Mapped inspection activity.</p>
          </div>
        </section>
        <div className="panel panel-accent-blue overflow-hidden">
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
    <div className="page-shell space-y-6">
      <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="page-rail">
          <div className="page-kicker">Inspection Map</div>
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
          <h1 className="page-title max-w-[10ch]">Inspection map</h1>
          <p className="page-subtitle">{getInspectionTimeWindowLabel(resolvedDays)} - {mapInspectionCount} mapped inspections.</p>
          <div>
            <a href={`/${city.key}/ward/${wardId}/table/inspections?days=${resolvedDays}`} className="action-link action-link-route">
              Open table view
            </a>
          </div>
        </div>
      </section>

      <div className="panel panel-accent-blue overflow-hidden">
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
