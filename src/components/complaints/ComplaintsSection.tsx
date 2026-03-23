import { getComplaints } from '@/services/complaintsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { shortenCompactLabel } from '@/lib/labels'
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
      <div className="panel panel-accent-red">
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
    <div className="panel panel-accent-red">
      <div className="panel-header">
        <span>311 Service Requests — Last {resolvedDays === 365 ? '12 months' : '90 days'} · {city.districtName} {districtLabel}</span>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <a href={mapHref} className="action-link action-link-route">
            Map view
          </a>
          {view === 'full' ? (
            <a href={`/${city.key}/ward/${wardId}`} className="action-link action-link-route">
              Back to dashboard
            </a>
          ) : (
            <a href={expandHref} className="action-link action-link-route">
              Open full table
            </a>
          )}
          <span className="tag tag-blue">{stats.total} total</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 border-b border-[rgba(17,17,17,0.18)]">
        <div className="border-r border-[rgba(17,17,17,0.18)] px-5 py-4">
          <div className="stat-label">Open</div>
          <div className="stat-value text-[var(--red)]">{stats.openCount}</div>
        </div>
        <div className="px-5 py-4">
          <div className="stat-label">Closed</div>
          <div className="stat-value text-[var(--green)]">{stats.closedCount}</div>
        </div>
      </div>

      {/* Top types */}
      {stats.byType.length > 0 && (
        <div className="border-b border-[rgba(17,17,17,0.18)]">
          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Top types
          </div>
          {stats.byType.slice(0, 5).map(({ type, count }) => {
            const pct = Math.round((count / stats.total) * 100)
            return (
              <div key={type} className="data-row">
                <span className="flex-1 truncate text-[0.8rem] text-[var(--ink)]">{shortenCompactLabel(type) || type}</span>
                <span className="ml-2 w-8 text-right text-[0.72rem] font-bold text-[var(--muted)]">{count}</span>
                <div className="ml-3 h-2 w-20 overflow-hidden border border-[var(--line)] bg-[rgba(17,17,17,0.05)]">
                  <div className="h-full bg-[var(--red)]" style={{ width: `${pct}%` }} />
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
          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            {view === 'full' ? 'All requests' : 'Recent requests'}
          </div>
          {visibleComplaints.map((c) => (
            <ExpandableRow
              key={c.srNumber}
              summary={(
                <>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[0.84rem] font-bold text-[var(--ink)]">
                      {shortenCompactLabel(c.srType) || c.srType}
                    </span>
                    <span className="block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {c.streetAddress ?? 'Address not provided'} · {formatDate(c.createdDate)}
                    </span>
                  </div>
                  <span className={c.status === 'Closed' ? 'tag tag-green flex-shrink-0' : 'tag tag-yellow flex-shrink-0'}>
                    {c.status}
                  </span>
                </>
              )}
            >
              <div className="space-y-2">
                {shouldShowExpandedText(c.srType) && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Request</div>
                    <div className="expandable-row-text">{c.srType}</div>
                  </div>
                )}
                {shouldShowExpandedText(c.streetAddress) && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Address</div>
                    <div className="expandable-row-text">{c.streetAddress}</div>
                  </div>
                )}
                {c.closedDate && (
                  <div><span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Closed:</span> {formatDate(c.closedDate)}</div>
                )}
                {c.resolutionDays !== null && (
                  <div><span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Resolution:</span> {c.resolutionDays} days</div>
                )}
                <div><span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Request ID:</span> {c.srNumber}</div>
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
