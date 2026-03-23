'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { DepartmentBudget } from '@/services/budgetService'

interface Props {
  departments: DepartmentBudget[]
}

function shortName(name: string) {
  return name
    .replace('Department of ', '')
    .replace('Chicago ', '')
    .replace(' Department', '')
    .replace(' Authority', '')
}

function truncateLabel(label: string, maxLength = 20) {
  if (label.length <= maxLength) return label
  return `${label.slice(0, maxLength - 1)}…`
}

function formatM(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  return `$${(value / 1e6).toFixed(0)}M`
}

const COLORS = [
  '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  '#1e40af', '#1e3a8a', '#172554', '#3730a3', '#4338ca',
]

export default function BudgetChart({ departments }: Props) {
  const data = departments.map((d) => ({
    name: truncateLabel(shortName(d.department)),
    amount: d.amount,
    full: d.department,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#64748b' }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={formatM}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={55}
          />
          <Tooltip
            formatter={(value) => [formatM(Number(value)), 'Budget']}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.full ?? label}
            contentStyle={{
              border: '1px solid #d1d5db',
              fontSize: '11px',
              padding: '4px 8px',
            }}
          />
          <Bar dataKey="amount" radius={[0, 0, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
