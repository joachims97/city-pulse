import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { getRepresentative } from '@/services/wardService'
import { getCityOrNull } from '@/config/cities'
import { getDistrictDisplayName } from '@/lib/districts'
import RepresentativeCard from '@/components/ward/RepresentativeCard'
import ComplaintsSection from '@/components/complaints/ComplaintsSection'
import PermitsSection from '@/components/permits/PermitsSection'
import InspectionsSection from '@/components/inspections/InspectionsSection'
import SectionSkeleton from '@/components/ui/SectionSkeleton'

const WardMap = dynamic(() => import('@/components/ward/WardMap'), { ssr: false })

interface Props {
  params: { cityKey: string; wardId: string }
  searchParams: { address?: string; lat?: string; lng?: string }
}

export async function generateMetadata({ params }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'City Not Found — CityPulse' }
  const wardId = parseInt(params.wardId, 10)
  const districtDisplayName = Number.isNaN(wardId) ? city.districtName : getDistrictDisplayName(city, wardId)
  return {
    title: `${districtDisplayName} — CityPulse ${city.displayName}`,
    description: `Open data for ${city.displayName} ${districtDisplayName}: representative, 311 requests, permits, and inspections.`,
  }
}

export default async function CityWardPage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const wardId = parseInt(params.wardId, 10)
  if (isNaN(wardId) || wardId < 1 || wardId > city.districtCount) {
    notFound()
  }

  const address = searchParams.address
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined
  const rep = await getRepresentative(wardId, city)
  const districtDisplayName = getDistrictDisplayName(city, wardId)

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-4">
      {/* Breadcrumb */}
      <div className="text-xs text-gray-500 mb-3">
        <a href="/" className="text-blue-700 hover:underline">Home</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}`} className="text-blue-700 hover:underline">{city.displayName}</a>
        <span className="mx-1.5">›</span>
        <span>{districtDisplayName}</span>
      </div>

      {/* Page header */}
      <div className="border border-gray-300 px-3 py-2 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-gray-900">{city.displayName} — {districtDisplayName}</h1>
          {address && <p className="text-xs text-gray-500 mt-0.5">{address}</p>}
        </div>
        <span className="text-xs text-gray-400">{city.state}</span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <span>{city.districtName} Locator</span>
            </div>
            <WardMap
              cityKey={city.key}
              wardId={wardId}
              districtName={city.districtName}
              lat={Number.isFinite(lat) ? lat : undefined}
              lng={Number.isFinite(lng) ? lng : undefined}
            />
          </div>

          <RepresentativeCard rep={rep} districtName={city.districtName} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Suspense fallback={<SectionSkeleton lines={5} />}>
            <InspectionsSection wardId={wardId} cityKey={city.key} />
          </Suspense>

          <Suspense fallback={<SectionSkeleton lines={4} />}>
            <PermitsSection wardId={wardId} cityKey={city.key} />
          </Suspense>

          <Suspense fallback={<SectionSkeleton lines={6} />}>
            <ComplaintsSection wardId={wardId} cityKey={city.key} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
