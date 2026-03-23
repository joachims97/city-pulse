import type { ReactNode } from 'react'

interface ExpandableRowProps {
  summary: ReactNode
  children: ReactNode
  bodyClassName?: string
}

export default function ExpandableRow({ summary, children, bodyClassName }: ExpandableRowProps) {
  const classes = ['expandable-row-body', bodyClassName].filter(Boolean).join(' ')

  return (
    <details className="expandable-row">
      <summary className="expandable-row-summary">
        {summary}
        <span className="expandable-row-toggle" aria-hidden="true">
          <span className="expandable-row-toggle-collapsed">+</span>
          <span className="expandable-row-toggle-expanded">−</span>
        </span>
      </summary>
      <div className={classes}>{children}</div>
    </details>
  )
}
