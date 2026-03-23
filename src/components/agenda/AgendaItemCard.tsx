'use client'

import { useState } from 'react'
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
  const [expanded, setExpanded] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  const statusClass = STATUS_TAGS[item.matterStatus ?? ''] ?? 'tag-gray'
  const displaySummary = sanitizeSummaryText(showSummary ? item.aiSummary : null)

  function handleSummaryToggle() {
    setShowSummary((value) => !value)
  }

  return (
    <div className="data-row flex-col items-start gap-1 py-2">
      {(item.matterFile || item.matterDate || item.sourceUrl) && (
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {item.matterFile && <span>{item.matterFile}</span>}
          {item.matterDate && <span>{formatDate(item.matterDate)}</span>}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline"
            >
              Source
            </a>
          )}
        </div>
      )}

      {(item.matterType || item.matterStatus) && (
        <div className="flex flex-wrap items-center gap-1 w-full">
          {item.matterType && (
            <span className="tag tag-gray">{item.matterType}</span>
          )}
          {item.matterStatus && (
            <span className={`tag ${statusClass}`}>{item.matterStatus}</span>
          )}
        </div>
      )}

      <div className="w-full">
        <span className="text-xs text-gray-800 leading-snug block">{item.matterTitle}</span>
      </div>

      {showSummary && displaySummary ? (
        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 px-2 py-1.5 w-full">
          {displaySummary}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        {item.agendaNote && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
        {displaySummary || item.aiSummary ? (
          <button
            onClick={handleSummaryToggle}
            className="text-xs text-blue-700 hover:underline"
          >
            {showSummary ? 'Hide summary' : 'Summary'}
          </button>
        ) : null}
      </div>

      {expanded && item.agendaNote && !showSummary && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1.5 w-full leading-relaxed">
          {item.agendaNote}
        </div>
      )}
    </div>
  )
}
