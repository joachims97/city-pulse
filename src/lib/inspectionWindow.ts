export function getInspectionDefaultDays(cityKey: string): number {
  return cityKey === 'philadelphia' ? 90 : 365
}

export function getInspectionTimeWindowLabel(days: number): string {
  if (days === 365) {
    return 'Last 12 months'
  }

  return `Last ${days} days`
}

export function getInspectionEmptyStateLabel(days: number): string {
  if (days === 365) {
    return 'last year'
  }

  return `last ${days} days`
}
