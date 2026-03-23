import { getBudget } from '@/services/budgetService'
import { getCity } from '@/config/cities'
import BudgetChart from './BudgetChart'
import EmptyState from '@/components/ui/EmptyState'

function formatBudget(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${(n / 1e3).toFixed(0)}K`
}

export default async function BudgetSection({ cityKey = 'chicago' }: { cityKey?: string }) {
  const city = getCity(cityKey)
  try {
    const budget = await getBudget(city)

    return (
      <div className="panel panel-accent-yellow">
        <div className="panel-header budget-panel-header">
          <span className="budget-panel-title">City Budget{budget.fiscalYear ? ` — FY${budget.fiscalYear}` : ''}</span>
        </div>

        {budget.departments.length === 0 ? (
          <EmptyState message="Budget data not available for this city." />
        ) : (
          <>
            <div className="px-5 pb-2 pt-4">
              <div className="stat-label">Total budget</div>
              <div className="stat-value mt-2">{formatBudget(budget.totalBudget)}</div>
            </div>
            <div className="border-t border-[rgba(17,17,17,0.18)] px-2 pb-2 pt-4">
              <BudgetChart departments={budget.departments.slice(0, 10)} />
            </div>
            <div className="border-t border-[rgba(17,17,17,0.18)]">
              <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Top departments
              </div>
              {budget.departments.slice(0, 8).map((dept) => (
                <div key={dept.department} className="data-row">
                  <span className="flex-1 truncate text-[0.8rem] font-medium text-[var(--ink)]">{dept.department}</span>
                  <span className="ml-2 text-[0.75rem] font-bold text-[var(--ink)]">{formatBudget(dept.amount)}</span>
                  {dept.percentChange !== null && (
                    <span
                      className={`ml-2 w-12 text-right text-[0.68rem] font-bold uppercase tracking-[0.16em] ${
                        dept.percentChange >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'
                      }`}
                    >
                      {dept.percentChange >= 0 ? '+' : ''}{dept.percentChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  } catch {
    return (
      <div className="panel panel-accent-yellow">
        <div className="panel-header">
          <span>City Budget</span>
        </div>
        <EmptyState message="Budget data is temporarily unavailable." tone="error" />
      </div>
    )
  }
}
