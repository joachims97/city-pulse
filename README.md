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

Copy the example file and fill in the values you need:

```bash
cp .env.local.example .env.local
```

Key variables:

- `DATABASE_URL`: required for persistence and expected in production
- `ANTHROPIC_API_KEY`: required for cron-generated legislation summaries
- `CRON_SECRET`: required in production for the weekly Vercel cron
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

Full text hydration and summary generation are handled by a secret-protected Vercel cron route:

- `GET /api/cron/agenda-backfill`
- Protected by `Authorization: Bearer ${CRON_SECRET}`
- Scheduled in [`vercel.json`](/Users/joachim/Documents/city%20tracker/citypulse/vercel.json) for daily runs at `07:00 UTC` (3 AM Eastern during daylight saving time)

The cron job:

- hydrates missing full legislation text
- summarizes missing non-Chicago items from the last 7 days
- only touches rows that are still missing `fullText` or `aiSummary`

## Production notes

- `DATABASE_URL` must be configured in production; Prisma now fails fast instead of silently degrading.
- `REFRESH_SECRET` must be configured in production or `/api/refresh` will fail closed.
- `CRON_SECRET` must be configured in production or the weekly legislation cron will not run.
- `.env` is ignored and should never be committed.

## Verification

Before deploy:

```bash
./node_modules/.bin/tsc --noEmit
npm run build
```
