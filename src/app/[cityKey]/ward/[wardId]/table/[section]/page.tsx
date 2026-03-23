import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName } from '@/lib/districts'
import ComplaintsSection from '@/components/complaints/ComplaintsSection'
import PermitsSection from '@/components/permits/PermitsSection'
import InspectionsSection from '@/components/inspections/InspectionsSection'

interface Props {
  params: {
    cityKey: string
    wardId: string
    section: string
  }
  searchParams: {
    days?: string
    page?: string
    pageSize?: string
  }
}

const SECTION_LABELS = {
  complaints: '311 Service Requests',
  permits: 'Building Permits',
  inspections: 'Inspections',
} as const

function getDefaultDays(section: string, cityKey: string): number {
  switch (section) {
    case 'complaints':
      return cityKey === 'la' ? 365 : 90
    case 'permits':
      return 180
    case 'inspections':
      return 365
    default:
      return 90
  }
}

function getTimeWindowLabel(section: string, days: number): string {
  if (section === 'permits') {
    return `Last ${Math.round(days / 30)} months`
  }

  if (days === 365) {
    return 'Last 12 months'
  }

  return `Last ${days} days`
}

export async function generateMetadata({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }

  const wardId = parseInt(params.wardId, 10)
  const sectionLabel = SECTION_LABELS[params.section as keyof typeof SECTION_LABELS]
  if (!sectionLabel || Number.isNaN(wardId)) {
    return { title: 'Not Found — CityPulse' }
  }

  const defaultDays = getDefaultDays(params.section, city.key)
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = parseInt(searchParams.pageSize ?? '20', 10)
  const districtDisplayName = Number.isNaN(wardId) ? city.districtName : getDistrictDisplayName(city, wardId)

  return {
    title: `${sectionLabel} — ${city.displayName} ${districtDisplayName}`,
    description: `${sectionLabel} for ${city.displayName} ${districtDisplayName}, ${getTimeWindowLabel(params.section, days)}, page ${Number.isNaN(page) ? 1 : page} with ${Number.isNaN(pageSize) ? 20 : pageSize} rows.`,
  }
}

export default function WardSectionTablePage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (Number.isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const sectionLabel = SECTION_LABELS[params.section as keyof typeof SECTION_LABELS]
  if (!sectionLabel) {
    notFound()
  }

  const defaultDays = getDefaultDays(params.section, city.key)
  const days = parseInt(searchParams.days ?? String(defaultDays), 10)
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = parseInt(searchParams.pageSize ?? '20', 10)
  const resolvedDays = Number.isNaN(days) ? defaultDays : days
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return (
    <div className="w-full px-4 py-4">
      <div className="text-xs text-gray-500 mb-3">
        <a href="/" className="text-blue-700 hover:underline">Home</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}`} className="text-blue-700 hover:underline">{city.displayName}</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}/ward/${wardId}`} className="text-blue-700 hover:underline">{districtDisplayName}</a>
        <span className="mx-1.5">›</span>
        <span>{sectionLabel}</span>
      </div>

      <div className="border border-gray-300 px-3 py-2 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-gray-900">
            {city.displayName} — {districtDisplayName} — {sectionLabel}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{getTimeWindowLabel(params.section, resolvedDays)}</p>
        </div>
        <a href={`/${city.key}/ward/${wardId}`} className="text-xs text-blue-700 hover:underline">
          Close full screen
        </a>
      </div>

      <div className="w-full">
        {params.section === 'complaints' && (
          <ComplaintsSection
            wardId={wardId}
            cityKey={city.key}
            days={resolvedDays}
            view="full"
            page={page}
            pageSize={pageSize}
          />
        )}

        {params.section === 'permits' && (
          <PermitsSection
            wardId={wardId}
            cityKey={city.key}
            days={resolvedDays}
            view="full"
            page={page}
            pageSize={pageSize}
          />
        )}

        {params.section === 'inspections' && (
          <InspectionsSection
            wardId={wardId}
            cityKey={city.key}
            days={resolvedDays}
            view="full"
            page={page}
            pageSize={pageSize}
          />
        )}
      </div>
    </div>
  )
}
