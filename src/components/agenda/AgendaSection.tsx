import { getAgendaItems } from '@/services/agendaService'
import { getCity } from '@/config/cities'
import { paginateItems } from '@/lib/pagination'
import AgendaItemCard from './AgendaItemCard'
import EmptyState from '@/components/ui/EmptyState'
import TablePagination from '@/components/ui/TablePagination'

function getAgendaSortTime(matterDate: string | null, eventDate: string | null) {
  const value = matterDate ?? eventDate
  if (!value) return Number.NEGATIVE_INFINITY

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

interface AgendaSectionProps {
  cityKey?: string
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

export default async function AgendaSection({
  cityKey = 'chicago',
  view = 'preview',
  page,
  pageSize,
}: AgendaSectionProps) {
  const city = getCity(cityKey)
  const expandHref = `/${city.key}/table/legislation`

  try {
    const events = await getAgendaItems(city, view)
    const rows = events
      .flatMap((event) => event.items.map((item) => ({ event, item })))
      .sort((a, b) => {
        const timeDiff = getAgendaSortTime(b.item.matterDate, b.event.eventDate) - getAgendaSortTime(a.item.matterDate, a.event.eventDate)
        if (timeDiff !== 0) return timeDiff

        const fileA = a.item.matterFile ?? ''
        const fileB = b.item.matterFile ?? ''
        if (fileA !== fileB) return fileB.localeCompare(fileA)

        return a.item.matterTitle.localeCompare(b.item.matterTitle)
      })
    const pagination = view === 'full' ? paginateItems(rows, page, pageSize) : null
    const visibleRows = pagination ? pagination.items : rows.slice(0, 12)

    return (
      <div className="panel panel-accent-black">
        <div className="panel-header">
          <span>City Council Legislation</span>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {view === 'full' ? (
              <a href={`/${city.key}`} className="action-link">
                Back to city
              </a>
            ) : (
              <a href={expandHref} className="action-link">
                Open full feed
              </a>
            )}
            <span className="tag tag-blue">{rows.length} items</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState message="No recent council legislation found." />
        ) : (
          <div>
            {pagination && (
              <TablePagination
                currentPage={pagination.currentPage}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
                startItem={pagination.startItem}
                endItem={pagination.endItem}
              />
            )}

            {visibleRows.map((row) => (
              <AgendaItemCard key={row.item.id} item={row.item} />
            ))}

            {pagination && (
              <TablePagination
                currentPage={pagination.currentPage}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
                startItem={pagination.startItem}
                endItem={pagination.endItem}
              />
            )}
          </div>
        )}
      </div>
    )
  } catch {
    return (
      <div className="panel panel-accent-black">
        <div className="panel-header">
          <span>City Council Legislation</span>
        </div>
        <EmptyState message="Legislation data is temporarily unavailable." tone="error" />
      </div>
    )
  }
}
