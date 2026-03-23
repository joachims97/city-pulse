import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import { getZipSuggestions } from '@/config/zipSuggestions'
import { getDistrictLabel } from '@/lib/districts'
import AddressSearch from '@/components/address/AddressSearch'
import BudgetSection from '@/components/budget/BudgetSection'
import AgendaSection from '@/components/agenda/AgendaSection'
import SectionSkeleton from '@/components/ui/SectionSkeleton'

const CityDistrictMap = dynamic(() => import('@/components/map/CityDistrictMap'), { ssr: false })

interface Props {
  params: { cityKey: string }
}

export async function generateMetadata({ params }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }
  return {
    title: `${city.displayName} — CityPulse`,
    description: `City-level open data for ${city.displayName}: budget, council legislation, and district lookup.`,
  }
}

export default function CityPage({ params }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const districtLinks = Array.from({ length: city.districtCount }, (_, i) => {
    const districtId = i + 1
    return {
      ward: districtId,
      label: getDistrictLabel(city, districtId),
    }
  })

  return (
    <div className="page-shell space-y-8">
      <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="page-rail">
          <div className="page-kicker">City</div>
          <div className="breadcrumbs">
            <a href="/">Home</a>
            <span className="breadcrumbs-sep">/</span>
            <span>{city.displayName}</span>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="page-title">{city.displayName}</h1>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
        <div className="space-y-6">
          <div className="panel panel-accent-red">
            <div className="panel-header">
              <span>Search by ZIP</span>
            </div>
            <div className="px-5 pb-5 pt-4">
              <AddressSearch
                cityKey={city.key}
                cityName={city.displayName}
                districtLinks={districtLinks}
                placeholder="Enter ZIP code"
                browseLabel={`Browse by ${city.districtName}`}
                zipSuggestions={getZipSuggestions(city.key)}
              />
            </div>
          </div>

          <div className="panel panel-accent-blue overflow-hidden">
            <div className="panel-header">
              <span>Select from map</span>
            </div>
            <CityDistrictMap cityKey={city.key} districtName={city.districtName} />
          </div>
        </div>

        <div className="self-start">
          <Suspense fallback={<SectionSkeleton lines={6} />}>
            <BudgetSection cityKey={city.key} />
          </Suspense>
        </div>
      </section>

      <section className="space-y-6">
        <Suspense fallback={<SectionSkeleton lines={5} />}>
          <AgendaSection cityKey={city.key} />
        </Suspense>
      </section>
    </div>
  )
}
