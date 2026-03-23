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
    <div className="page-shell space-y-8">
      <section className="page-rule">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="breadcrumbs">
              <a href="/">Home</a>
              <span className="breadcrumbs-sep">/</span>
              <a href={`/${city.key}`}>{city.displayName}</a>
              <span className="breadcrumbs-sep">/</span>
              <span>{districtDisplayName}</span>
            </div>

            <div className="space-y-3">
              <h1 className="page-title max-w-[10ch]">{districtDisplayName}</h1>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="panel panel-accent-blue overflow-hidden">
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

            <div className="space-y-6">
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
      </section>
    </div>
  )
}
