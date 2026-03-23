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
      <div className="panel">
        <div className="panel-header">
          <span>City Budget{budget.fiscalYear ? ` — FY${budget.fiscalYear}` : ''}</span>
          {budget.totalBudget > 0 && (
            <span className="text-gray-600 font-normal">{formatBudget(budget.totalBudget)} total</span>
          )}
        </div>

        {budget.departments.length === 0 ? (
          <EmptyState message="Budget data not available for this city." />
        ) : (
          <>
            <BudgetChart departments={budget.departments.slice(0, 10)} />
            <div className="border-t border-gray-200">
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Top Departments</div>
              {budget.departments.slice(0, 8).map((dept) => (
                <div key={dept.department} className="data-row">
                  <span className="text-xs text-gray-700 flex-1 truncate">{dept.department}</span>
                  <span className="text-xs font-medium text-gray-900 ml-2">{formatBudget(dept.amount)}</span>
                  {dept.percentChange !== null && (
                    <span className={`text-xs ml-2 w-10 text-right ${dept.percentChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
      <div className="panel">
        <div className="panel-header">
          <span>City Budget</span>
        </div>
        <EmptyState message="Budget data is temporarily unavailable." tone="error" />
      </div>
    )
  }
}
