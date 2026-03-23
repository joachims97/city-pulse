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
    <div className="max-w-screen-xl mx-auto px-4 py-4">
      <div className="text-xs text-gray-500 mb-3">
        <a href="/" className="text-blue-700 hover:underline">Home</a>
        <span className="mx-1.5">›</span>
        <span>{city.displayName}</span>
      </div>

      <div className="border border-gray-300 p-4 mb-4">
        <h1 className="text-base font-bold text-gray-900">{city.displayName}, {city.state}</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          {city.districtCount} {city.districtName}s · City budget, legislation, and district lookup
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_24rem] gap-4 mb-4 items-start">
        <div className="order-1 lg:order-none flex flex-col gap-4 self-start">
          <div className="panel">
            <div className="panel-header">
              <span>Search by zip</span>
            </div>
            <div className="p-3">
              <AddressSearch
                cityKey={city.key}
                cityName={city.displayName}
                districtLinks={districtLinks}
                placeholder="Enter zip code"
                browseLabel={`Browse by ${city.districtName}`}
                zipSuggestions={getZipSuggestions(city.key)}
              />
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="panel-header">
              <span>Select from map</span>
              <span className="text-gray-500 font-normal">Click a district to open it</span>
            </div>
            <CityDistrictMap cityKey={city.key} districtName={city.districtName} />
          </div>
        </div>

        <div className="order-3 lg:order-none self-start">
          <Suspense fallback={<SectionSkeleton lines={6} />}>
            <BudgetSection cityKey={city.key} />
          </Suspense>
        </div>
      </div>

      <div className="space-y-4">
        <Suspense fallback={<SectionSkeleton lines={5} />}>
          <AgendaSection cityKey={city.key} />
        </Suspense>
      </div>
    </div>
  )
}
