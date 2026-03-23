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
    <div className="page-shell space-y-6">
      <section className="page-rule grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)_18rem]">
        <div className="page-rail">
          <div className="page-kicker">Legislation</div>
          <div className="breadcrumbs">
            <a href="/">Home</a>
            <span className="breadcrumbs-sep">/</span>
            <a href={`/${city.key}`}>{city.displayName}</a>
            <span className="breadcrumbs-sep">/</span>
            <span>Full feed</span>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="page-title max-w-[12ch]">City council legislation</h1>
          <p className="page-subtitle">
            Full-screen legislation feed for {city.displayName}, paged for deeper browsing.
          </p>
        </div>

        <div className="summary-card summary-card-blue">
          <div className="summary-card-body">
            <div className="summary-card-label">View</div>
            <div className="summary-card-value">01</div>
            <div className="summary-card-copy">
              <a href={`/${city.key}`} className="action-link-light">Back to city dashboard</a>
            </div>
          </div>
        </div>
      </section>

      <AgendaSection cityKey={city.key} view="full" page={page} pageSize={pageSize} />
    </div>
  )
}
