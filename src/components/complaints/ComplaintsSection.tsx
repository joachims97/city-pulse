import { getComplaints } from '@/services/complaintsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { paginateItems } from '@/lib/pagination'
import EmptyState from '@/components/ui/EmptyState'
import ExpandableRow from '@/components/ui/ExpandableRow'
import TablePagination from '@/components/ui/TablePagination'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shouldShowExpandedText(value: string | null, minimumLength = 60) {
  return Boolean(value && value.trim().length > minimumLength)
}

interface ComplaintsSectionProps {
  wardId: number
  cityKey?: string
  days?: number
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

const PREVIEW_ROW_COUNT = 13

export default async function ComplaintsSection({
  wardId,
  cityKey = 'chicago',
  days,
  view = 'preview',
  page,
  pageSize,
}: ComplaintsSectionProps) {
  const city = getCity(cityKey)
  const districtLabel = getDistrictLabel(city, wardId)
  const resolvedDays = days ?? (city.key === 'la' ? 365 : 90)
  const expandHref = `/${city.key}/ward/${wardId}/table/complaints?days=${resolvedDays}`
  const mapHref = `/${city.key}/ward/${wardId}/map/complaints?days=${resolvedDays}`
  let complaints
  let stats

  try {
    const data = await getComplaints(wardId, city, resolvedDays, view)
    complaints = data.complaints
    stats = data.stats
  } catch {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>311 Service Requests — Last {resolvedDays === 365 ? '12 months' : '90 days'} · {city.districtName} {districtLabel}</span>
        </div>
        <EmptyState message="311 request data is temporarily unavailable." tone="error" />
      </div>
    )
  }

  const pagination = view === 'full' ? paginateItems(complaints, page, pageSize) : null
  const visibleComplaints = pagination ? pagination.items : complaints.slice(0, PREVIEW_ROW_COUNT)

  return (
    <div className="panel">
      <div className="panel-header">
        <span>311 Service Requests — Last {resolvedDays === 365 ? '12 months' : '90 days'} · {city.districtName} {districtLabel}</span>
        <div className="flex items-center gap-2">
          <a href={mapHref} className="text-xs text-blue-700 hover:underline font-normal">
            Map view
          </a>
          {view === 'full' ? (
            <a href={`/${city.key}/ward/${wardId}`} className="text-xs text-blue-700 hover:underline font-normal">
              Back to dashboard
            </a>
          ) : (
            <a href={expandHref} className="text-xs text-blue-700 hover:underline font-normal">
              Click to expand
            </a>
          )}
          <span className="tag tag-blue">{stats.total} total</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex border-b border-gray-200">
        <div className="flex-1 px-3 py-2 border-r border-gray-200">
          <div className="stat-label">Open</div>
          <div className="stat-value text-yellow-700">{stats.openCount}</div>
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="stat-label">Closed</div>
          <div className="stat-value text-green-700">{stats.closedCount}</div>
        </div>
      </div>

      {/* Top types */}
      {stats.byType.length > 0 && (
        <div className="border-b border-gray-200">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Top Types</div>
          {stats.byType.slice(0, 5).map(({ type, count }) => {
            const pct = Math.round((count / stats.total) * 100)
            return (
              <div key={type} className="data-row">
                <span className="flex-1 text-xs text-gray-700 truncate">{type}</span>
                <span className="text-xs text-gray-500 ml-2 w-6 text-right">{count}</span>
                <div className="ml-2 w-16 h-1.5 bg-gray-100 overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent list */}
      {complaints.length === 0 ? (
        <EmptyState message={`No 311 complaints found for this district in the last ${resolvedDays === 365 ? '12 months' : '90 days'}.`} />
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
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
            {view === 'full' ? 'All Requests' : 'Recent Requests'}
          </div>
          {visibleComplaints.map((c) => (
            <ExpandableRow
              key={c.srNumber}
              summary={(
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-800 truncate block">{c.srType}</span>
                    <span className="text-xs text-gray-400 truncate block">
                      {c.streetAddress ?? 'Address not provided'} · {formatDate(c.createdDate)}
                    </span>
                  </div>
                  <span className={c.status === 'Closed' ? 'tag tag-green flex-shrink-0' : 'tag tag-yellow flex-shrink-0'}>
                    {c.status}
                  </span>
                </>
              )}
            >
              <div className="space-y-1">
                {shouldShowExpandedText(c.srType) && (
                  <div>
                    <div className="font-medium text-gray-700">Request</div>
                    <div className="expandable-row-text">{c.srType}</div>
                  </div>
                )}
                {shouldShowExpandedText(c.streetAddress) && (
                  <div>
                    <div className="font-medium text-gray-700">Address</div>
                    <div className="expandable-row-text">{c.streetAddress}</div>
                  </div>
                )}
                {c.closedDate && (
                  <div><span className="font-medium text-gray-700">Closed:</span> {formatDate(c.closedDate)}</div>
                )}
                {c.resolutionDays !== null && (
                  <div><span className="font-medium text-gray-700">Resolution:</span> {c.resolutionDays} days</div>
                )}
                <div><span className="font-medium text-gray-700">Request ID:</span> {c.srNumber}</div>
              </div>
            </ExpandableRow>
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
}
