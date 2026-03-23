import { notFound } from 'next/navigation'
import { getCityOrNull } from '@/config/cities'
import AgendaSection from '@/components/agenda/AgendaSection'

interface Props {
  params: {
    cityKey: string
  }
  searchParams: {
    page?: string
    pageSize?: string
  }
}

export async function generateMetadata({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) return { title: 'Not Found — CityPulse' }

  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = parseInt(searchParams.pageSize ?? '20', 10)

  return {
    title: `City Council Legislation — ${city.displayName}`,
    description: `City council legislation for ${city.displayName}, page ${Number.isNaN(page) ? 1 : page} with ${Number.isNaN(pageSize) ? 20 : pageSize} rows.`,
  }
}

export default function CityLegislationTablePage({ params, searchParams }: Props) {
  const city = getCityOrNull(params.cityKey)
  if (!city) notFound()

  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = parseInt(searchParams.pageSize ?? '20', 10)

  return (
    <div className="w-full px-4 py-4">
      <div className="text-xs text-gray-500 mb-3">
        <a href="/" className="text-blue-700 hover:underline">Home</a>
        <span className="mx-1.5">›</span>
        <a href={`/${city.key}`} className="text-blue-700 hover:underline">{city.displayName}</a>
        <span className="mx-1.5">›</span>
        <span>City Council Legislation</span>
      </div>

      <div className="border border-gray-300 px-3 py-2 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-gray-900">
            {city.displayName} — City Council Legislation
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Full legislation feed</p>
        </div>
        <a href={`/${city.key}`} className="text-xs text-blue-700 hover:underline">
          Close full screen
        </a>
      </div>

      <AgendaSection cityKey={city.key} view="full" page={page} pageSize={pageSize} />
    </div>
  )
}
