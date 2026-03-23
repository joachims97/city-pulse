import { runAgendaBackfill } from '@/services/agendaCron'

interface CliOptions {
  cityKey?: string
  days?: number
  limit?: number
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const result = await runAgendaBackfill({
    cityKey: options.cityKey ?? null,
    days: options.days ?? null,
    limit: options.limit ?? null,
  })

  console.log(
    JSON.stringify(
      {
        cityKey: options.cityKey ?? 'all',
        days: result.days,
        limit: result.limit,
        totals: result.totals,
        fullTextResults: result.fullTextResults,
        summaryResults: result.summaryResults,
      },
      null,
      2
    )
  )

  const errors = [
    ...result.fullTextResults.filter((item) => item.error),
    ...result.summaryResults.filter((item) => item.error),
  ]

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((item) => `${item.cityKey}: ${item.error}`)
        .join('; ')
    )
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {}

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const next = args[i + 1]

    if (arg === '--city' && next) {
      options.cityKey = next
      i += 1
      continue
    }

    if (arg === '--days' && next) {
      options.days = parseInt(next, 10)
      i += 1
      continue
    }

    if (arg === '--limit' && next) {
      options.limit = parseInt(next, 10)
      i += 1
    }
  }

  return options
}

main().catch((error) => {
  console.error('[agenda-backfill]', error)
  process.exitCode = 1
})
