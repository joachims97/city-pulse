'use client'

import type { SyntheticEvent } from 'react'
import { useMemo, useState } from 'react'
import { sanitizeSummaryText } from '@/lib/claude'
import type { AgendaItem } from '@/services/agendaService'

const STATUS_TAGS: Record<string, string> = {
  'Passed': 'tag-green',
  'Failed': 'tag-red',
  'In Committee': 'tag-yellow',
  'Referred': 'tag-blue',
  'Tabled': 'tag-gray',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AgendaItemCard({ item }: { item: AgendaItem }) {
  const displaySummary = useMemo(() => sanitizeSummaryText(item.aiSummary), [item.aiSummary])
  const hasSummary = Boolean(displaySummary)
  const hasDetails = Boolean(item.agendaNote?.trim())
  const defaultTab = hasSummary ? 'summary' : 'details'
  const [activeTab, setActiveTab] = useState<'summary' | 'details'>(defaultTab)

  const statusClass = STATUS_TAGS[item.matterStatus ?? ''] ?? 'tag-gray'
  const activeContent = activeTab === 'summary' ? displaySummary : item.agendaNote

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) {
      setActiveTab(defaultTab)
    }
  }

  return (
    <details className="expandable-row" onToggle={handleToggle}>
      <summary className="expandable-row-summary">
        <div className="flex-1 min-w-0">
          {(item.matterFile || item.matterDate) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
              {item.matterFile && <span>{item.matterFile}</span>}
              {item.matterDate && <span>{formatDate(item.matterDate)}</span>}
            </div>
          )}

          {(item.matterType || item.matterStatus || hasSummary) && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {item.matterType && (
                <span className="tag tag-gray">{item.matterType}</span>
              )}
              {item.matterStatus && (
                <span className={`tag ${statusClass}`}>{item.matterStatus}</span>
              )}
              {hasSummary && (
                <span className="text-[0.54rem] font-bold uppercase tracking-[0.18em] text-[rgba(0,87,255,0.62)]">
                  Summary available
                </span>
              )}
            </div>
          )}

          <span className="block text-[0.95rem] font-medium leading-6 text-[var(--ink)]">{item.matterTitle}</span>
        </div>

        <span className="expandable-row-toggle" aria-hidden="true">
          <span className="expandable-row-toggle-collapsed">+</span>
          <span className="expandable-row-toggle-expanded">−</span>
        </span>
      </summary>

      <div className="expandable-row-body">
        <div className="space-y-3">
          {(hasSummary || hasDetails || item.sourceUrl) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasSummary && (
                <button
                  type="button"
                  onClick={() => setActiveTab('summary')}
                  className={`text-[0.68rem] font-bold uppercase tracking-[0.18em] underline underline-offset-[0.24em] ${
                    activeTab === 'summary' ? 'text-[var(--blue)]' : 'text-[rgba(17,17,17,0.45)]'
                  }`}
                >
                  Summary
                </button>
              )}
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`text-[0.68rem] font-bold uppercase tracking-[0.18em] underline underline-offset-[0.24em] ${
                    activeTab === 'details' ? 'text-[var(--blue)]' : 'text-[rgba(17,17,17,0.45)]'
                  }`}
                >
                  Details
                </button>
              )}
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="action-link !text-[0.68rem]"
                >
                  Source
                </a>
              )}
            </div>
          )}

          {activeContent && (
            <div className={`w-full border px-3 py-3 text-[0.8rem] leading-6 ${
              activeTab === 'summary'
                ? 'border-[var(--blue)] bg-[rgba(0,87,255,0.06)] text-[var(--muted)]'
                : 'border-[rgba(17,17,17,0.16)] bg-[rgba(17,17,17,0.04)] text-[var(--muted)]'
            }`}>
              {activeContent}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
