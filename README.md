# CityPulse

CityPulse is a multi-city civic data app that brings district-level public data into one place:

- 311 service requests
- building permits
- inspections
- city budget
- city council legislation

Current live cities:

- Chicago
- New York City
- San Francisco
- Los Angeles
- Philadelphia
- Charlotte
- Raleigh

## Local setup

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Create a `.env.local` file for local development and fill in the values you need.

Key variables:

- `DATABASE_URL`: required for persistence and expected in production
- `ANTHROPIC_API_KEY`: required for cron-generated legislation summaries
- `CRON_SECRET`: optional secret if you want to keep the protected cron API route available for manual/admin runs
- `REFRESH_SECRET`: required in production for the manual cache refresh endpoint
- `REDIS_URL`: optional
- `CHICAGO_DATA_APP_TOKEN`: optional

## Architecture

- Next.js 14 App Router
- PostgreSQL + Prisma for persistence
- Redis or in-memory cache for short-lived caching
- Leaflet for district and dataset map views
- Anthropic Haiku 4.5 for cached legislation summaries
- City-specific providers across Socrata, ArcGIS, Carto, PDF, Legistar, eLMS, Clerk Connect, and eScribe

## Cached legislation summaries

Legislation summaries are cache-only in the UI.

- Residents can only reveal summaries that already exist in the database.
- The UI does not generate summaries on demand.
- Chicago is excluded from automated summarization for now.

Full text hydration and summary generation are handled by a scheduled GitHub Actions workflow:

- Workflow file: [.github/workflows/agenda-backfill.yml](/Users/joachim/Documents/city%20tracker/citypulse/.github/workflows/agenda-backfill.yml)
- Scheduled daily at `3:07 AM America/New_York`
- Runs each city in its own GitHub Actions job so one slow city does not block the others
- Can also be triggered manually from the GitHub Actions tab

The workflow:

- hydrates missing full legislation text
- summarizes missing non-Chicago items from the last 7 days
- only touches rows that are still missing `fullText` or `aiSummary`
- defaults to a bounded batch size per city so scheduled jobs stay predictable

## Production notes

- `DATABASE_URL` must be configured in production; Prisma now fails fast instead of silently degrading.
- `REFRESH_SECRET` must be configured in production or `/api/refresh` will fail closed.
- If you use the GitHub Actions workflow, set `DATABASE_URL`, `ANTHROPIC_API_KEY`, optional `REDIS_URL`, and optional `CHICAGO_DATA_APP_TOKEN` as GitHub Actions repository secrets.
- `CRON_SECRET` is only needed if you plan to call the protected `/api/cron/agenda-backfill` routes directly.
- `.env` is ignored and should never be committed.

## Verification

Before deploy:

```bash
./node_modules/.bin/tsc --noEmit
npm run build
```
