import { getInspections } from '@/services/inspectionsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { shortenCompactLabel } from '@/lib/labels'
import { paginateItems } from '@/lib/pagination'
import EmptyState from '@/components/ui/EmptyState'
import ExpandableRow from '@/components/ui/ExpandableRow'
import TablePagination from '@/components/ui/TablePagination'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ResultTag({ results, isFailed, isRecentFail }: { results: string | null; isFailed: boolean; isRecentFail: boolean }) {
  const fullLabel = compactResult(results)
  const label = shortenCompactLabel(fullLabel)
  const normalized = fullLabel.toLowerCase()

  if (isRecentFail) return <span className="tag tag-red">Recent Fail</span>
  if (isFailed || normalized.includes('closed')) return <span className="tag tag-red">{label}</span>
  if (normalized.includes('pass w/') || normalized.includes('condition') || normalized.includes('partial') || normalized.includes('violation')) {
    return <span className="tag tag-yellow">{label}</span>
  }
  if (normalized.includes('pass') || normalized.includes('approved')) return <span className="tag tag-green">{label}</span>
  if (normalized.includes('scheduled') || normalized.includes('pending')) return <span className="tag tag-blue">{label}</span>
  return <span className="tag tag-gray">{label}</span>
}

function splitInspectionEntries(value: string | null) {
  if (!value) return []
  return value.split('|').map((entry) => entry.trim()).filter(Boolean)
}

function compactResult(results: string | null) {
  if (!results) return 'Status unavailable'
  if (results === 'Violations were cited in the following area(s).') return 'Violations'
  if (results === 'FAILED') return 'Fail'
  if (results === 'PASSED') return 'Pass'
  if (results === 'Insp Scheduled') return 'Scheduled'
  return results
}

function normalize(text: string | null) {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function shouldShowExpandedText(value: string | null, minimumLength = 60) {
  return Boolean(value && value.trim().length > minimumLength)
}

interface InspectionsSectionProps {
  wardId: number
  cityKey?: string
  days?: number
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

const PREVIEW_ROW_COUNT = 13

export default async function InspectionsSection({
  wardId,
  cityKey = 'chicago',
  days = 365,
  view = 'preview',
  page,
  pageSize,
}: InspectionsSectionProps) {
  const city = getCity(cityKey)
  const districtLabel = getDistrictLabel(city, wardId)
  const expandHref = `/${city.key}/ward/${wardId}/table/inspections?days=${days}`
  const mapHref = `/${city.key}/ward/${wardId}/map/inspections?days=${days}`
  let inspections

  try {
    inspections = await getInspections(wardId, city, days, view)
  } catch {
    return (
      <div className="panel panel-accent-blue">
        <div className="panel-header">
          <span>Inspections — Last 12 months · {city.districtName} {districtLabel}</span>
        </div>
        <EmptyState message="Inspection data is temporarily unavailable." tone="error" />
      </div>
    )
  }

  const recentFails = inspections.filter((i) => i.isRecentFail)
  const visibleRecentFails = recentFails.slice(0, PREVIEW_ROW_COUNT)
  const passes = inspections.filter((i) => !i.isFailed)
  const passRate = inspections.length > 0
    ? Math.round((passes.length / inspections.length) * 100)
    : null
  const pagination = view === 'full' ? paginateItems(inspections, page, pageSize) : null
  const visibleInspections = pagination ? pagination.items : inspections.slice(0, PREVIEW_ROW_COUNT)

  return (
    <div className="panel panel-accent-blue">
      <div className="panel-header">
        <span>Inspections — Last 12 months · {city.districtName} {districtLabel}</span>
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
          {passRate !== null && (
            <span className={passRate >= 80 ? 'tag tag-green' : 'tag tag-red'}>{passRate}% pass</span>
          )}
        </div>
      </div>

      {visibleRecentFails.length > 0 && (
        <div className="border-b border-[rgba(17,17,17,0.18)] bg-[rgba(216,76,47,0.08)] px-5 py-4">
          <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--red)]">
            Recent failures / last 30 days
          </div>
          {visibleRecentFails.map((i) => (
            <div key={i.id} className="text-[0.78rem] text-[var(--red)]">{i.dbaName} — {i.address}</div>
          ))}
        </div>
      )}

      {inspections.length === 0 ? (
        <EmptyState message="No inspections found for this district in the last year." />
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
          {visibleInspections.map((inspection) => (
            <ExpandableRow
              key={inspection.id}
              summary={(
                <>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[0.84rem] font-bold text-[var(--ink)]">{inspection.dbaName}</span>
                    <span className="block truncate text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {normalize(inspection.address) !== normalize(inspection.dbaName)
                        ? inspection.address ?? 'Address not provided'
                        : inspection.inspectionType ?? 'Inspection'}
                    </span>
                    <span className="block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {formatDate(inspection.inspectionDate)}
                      {inspection.riskLevel ? ` · ${inspection.riskLevel}` : ''}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <ResultTag
                      results={inspection.results}
                      isFailed={inspection.isFailed}
                      isRecentFail={inspection.isRecentFail}
                    />
                  </div>
                </>
              )}
            >
              <div className="space-y-2">
                {shouldShowExpandedText(inspection.dbaName) && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Business</div>
                    <div className="expandable-row-text">{inspection.dbaName}</div>
                  </div>
                )}
                {shouldShowExpandedText(inspection.address) && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Address</div>
                    <div className="expandable-row-text">{inspection.address}</div>
                  </div>
                )}
                {inspection.inspectionType && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Inspection</div>
                    <div className="expandable-row-text">{inspection.inspectionType}</div>
                  </div>
                )}
                {inspection.violations && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Violations</div>
                    <div className="mt-1 space-y-1 text-[var(--red)]">
                      {splitInspectionEntries(inspection.violations).map((violation) => (
                        <div key={violation} className="expandable-row-text">{violation}</div>
                      ))}
                    </div>
                  </div>
                )}
                {inspection.details && (
                  <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Details</div>
                    <div className="mt-1 space-y-1 text-[var(--muted)]">
                      {splitInspectionEntries(inspection.details).map((detail) => (
                        <div key={detail} className="expandable-row-text">{detail}</div>
                      ))}
                    </div>
                  </div>
                )}
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
