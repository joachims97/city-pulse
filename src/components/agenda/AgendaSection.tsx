import { getAgendaItems } from '@/services/agendaService'
import { getCity } from '@/config/cities'
import { paginateItems } from '@/lib/pagination'
import AgendaItemCard from './AgendaItemCard'
import EmptyState from '@/components/ui/EmptyState'
import TablePagination from '@/components/ui/TablePagination'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
    const rows = events.flatMap((event) => event.items.map((item) => ({ event, item })))
    const pagination = view === 'full' ? paginateItems(rows, page, pageSize) : null
    const visibleRows = pagination ? pagination.items : rows.slice(0, 12)

    return (
      <div className="panel">
        <div className="panel-header">
          <span>City Council Legislation</span>
          <div className="flex items-center gap-2">
            {view === 'full' ? (
              <a href={`/${city.key}`} className="text-xs text-blue-700 hover:underline font-normal">
                Back to city
              </a>
            ) : (
              <a href={expandHref} className="text-xs text-blue-700 hover:underline font-normal">
                Click to expand
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

            {visibleRows.map((row, index) => {
              const previousEventId = index > 0 ? visibleRows[index - 1]?.event.eventId : null
              const showEventHeader = row.event.eventId !== previousEventId

              return (
                <div key={row.item.id}>
                  {showEventHeader && (
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                      <div className="text-xs font-semibold text-gray-700">{row.event.bodyName}</div>
                      <div className="text-xs text-gray-500">
                        {[row.event.eventDate ? formatDate(row.event.eventDate) : null, row.event.location].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  )}

                  <AgendaItemCard item={row.item} />
                </div>
              )
            })}

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
      <div className="panel">
        <div className="panel-header">
          <span>City Council Legislation</span>
        </div>
        <EmptyState message="Legislation data is temporarily unavailable." tone="error" />
      </div>
    )
  }
}
