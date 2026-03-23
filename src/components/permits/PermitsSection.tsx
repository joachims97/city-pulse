import { getPermits } from '@/services/permitsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { shortenCompactLabel } from '@/lib/labels'
import { paginateItems } from '@/lib/pagination'
import EmptyState from '@/components/ui/EmptyState'
import ExpandableRow from '@/components/ui/ExpandableRow'
import TablePagination from '@/components/ui/TablePagination'

function formatCurrency(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function hasDistinctWorkDescription(permitType: string, workDescription: string | null) {
  if (!workDescription) return false
  return workDescription.trim() !== permitType.trim()
}

function getExpandedWorkDescription(workDescription: string | null, fullWorkDescription: string | null) {
  return fullWorkDescription ?? workDescription
}

function shouldShowExpandedText(value: string | null, minimumLength = 60) {
  return Boolean(value && value.trim().length > minimumLength)
}

interface PermitsSectionProps {
  wardId: number
  cityKey?: string
  days?: number
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

const PREVIEW_ROW_COUNT = 13

export default async function PermitsSection({
  wardId,
  cityKey = 'chicago',
  days = 180,
  view = 'preview',
  page,
  pageSize,
}: PermitsSectionProps) {
  const city = getCity(cityKey)
  const districtLabel = getDistrictLabel(city, wardId)
  const expandHref = `/${city.key}/ward/${wardId}/table/permits?days=${days}`
  const mapHref = `/${city.key}/ward/${wardId}/map/permits?days=${days}`
  let permits

  try {
    permits = await getPermits(wardId, city, days, view)
  } catch {
    return (
      <div className="panel panel-accent-yellow">
        <div className="panel-header">
          <span>Building Permits — Last 6 months · {city.districtName} {districtLabel}</span>
        </div>
        <EmptyState message="Permit data is temporarily unavailable." tone="error" />
      </div>
    )
  }

  const large = permits.filter((p) => p.isLargeDevelopment)
  const regular = permits.filter((p) => !p.isLargeDevelopment)
  const orderedPermits = view === 'full' ? [...large, ...regular] : permits
  const pagination = view === 'full' ? paginateItems(orderedPermits, page, pageSize) : null
  const previewLargeCount = Math.min(large.length, PREVIEW_ROW_COUNT)
  const previewRegularCount = Math.max(PREVIEW_ROW_COUNT - previewLargeCount, 0)
  const visibleLarge = pagination ? pagination.items.filter((permit) => permit.isLargeDevelopment) : large.slice(0, previewLargeCount)
  const visibleRegular = pagination
    ? pagination.items.filter((permit) => !permit.isLargeDevelopment)
    : regular.slice(0, previewRegularCount)

  return (
    <div className="panel panel-accent-yellow">
      <div className="panel-header">
        <span>Building Permits — Last 6 months · {city.districtName} {districtLabel}</span>
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
          <span className="tag tag-blue">{permits.length} permits</span>
        </div>
      </div>

      {permits.length === 0 ? (
        <EmptyState message={`No building permits found for this ward in the last ${Math.round(days / 30)} months.`} />
      ) : (
        <>
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

          {visibleLarge.length > 0 && (
            <>
              <div className="flex items-center justify-between border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                <span>Large Developments</span>
                <span className="tag tag-red">{view === 'full' ? visibleLarge.length : large.length}</span>
              </div>
              {visibleLarge.map((p) => {
                const expandedWorkDescription = getExpandedWorkDescription(p.workDescription, p.fullWorkDescription)
                const compactWorkLabel = shortenCompactLabel(p.workDescription ?? p.permitType) || p.workDescription || p.permitType

                return (
                  <ExpandableRow
                    key={p.id}
                    summary={(
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-[0.84rem] font-bold text-[var(--ink)]">{p.address ?? 'Address N/A'}</span>
                          <span className="block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                            {compactWorkLabel} · {formatDate(p.issueDate)}
                          </span>
                        </div>
                        <span className="flex-shrink-0 text-[0.74rem] font-bold text-[var(--ink)]">{formatCurrency(p.totalFee)}</span>
                      </>
                    )}
                  >
                    <div className="space-y-2">
                      {shouldShowExpandedText(p.address) && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Address</div>
                          <div className="expandable-row-text">{p.address}</div>
                        </div>
                      )}
                      <div><span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Permit No.:</span> {p.permitNumber}</div>
                      {hasDistinctWorkDescription(p.permitType, expandedWorkDescription) && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Type</div>
                          <div className="expandable-row-text">{p.permitType}</div>
                        </div>
                      )}
                      {expandedWorkDescription && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Work</div>
                          <div className="expandable-row-text">{expandedWorkDescription}</div>
                        </div>
                      )}
                      {p.contactName && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Contact</div>
                          <div className="expandable-row-text">{p.contactName}</div>
                        </div>
                      )}
                    </div>
                  </ExpandableRow>
                )
              })}
            </>
          )}

          {visibleRegular.length > 0 && (
            <>
              <div className="border-b border-t border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                {view === 'full' ? 'All Permits' : 'Recent Permits'}
              </div>
              {visibleRegular.map((p) => {
                const expandedWorkDescription = getExpandedWorkDescription(p.workDescription, p.fullWorkDescription)
                const compactPermitLabel = shortenCompactLabel(p.permitType) || p.permitType

                return (
                  <ExpandableRow
                    key={p.id}
                    summary={(
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-[0.82rem] text-[var(--ink)]">{p.address ?? 'Address N/A'}</span>
                          <span className="block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                            {compactPermitLabel} · {formatDate(p.issueDate)}
                          </span>
                        </div>
                        {p.totalFee !== null && (
                          <span className="flex-shrink-0 text-[0.72rem] font-bold text-[var(--muted)]">{formatCurrency(p.totalFee)}</span>
                        )}
                      </>
                    )}
                  >
                    <div className="space-y-2">
                      {shouldShowExpandedText(p.address) && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Address</div>
                          <div className="expandable-row-text">{p.address}</div>
                        </div>
                      )}
                      <div><span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Permit No.:</span> {p.permitNumber}</div>
                      {hasDistinctWorkDescription(p.permitType, expandedWorkDescription) && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Work</div>
                          <div className="expandable-row-text">{expandedWorkDescription}</div>
                        </div>
                      )}
                      {p.contactName && (
                        <div>
                          <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Contact</div>
                          <div className="expandable-row-text">{p.contactName}</div>
                        </div>
                      )}
                    </div>
                  </ExpandableRow>
                )
              })}
            </>
          )}

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
        </>
      )}
    </div>
  )
}
