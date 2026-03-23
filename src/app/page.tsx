import { getAllCities } from '@/config/cities'

export default function Home() {
  const cities = getAllCities()

  return (
    <div className="page-shell space-y-8">
      <section className="page-rule">
        <div>
          <h1 className="page-title max-w-[12ch]">Open civic data by district.</h1>
        </div>
      </section>

      <section>
        <div className="panel panel-accent-red overflow-hidden">
          <div className="panel-header">
            <span>Select a city</span>
          </div>

          <div>
            {cities.map((city) => (
              <a
                key={city.key}
                href={`/${city.key}`}
                className="link-plain data-row"
              >
                <span className="min-w-0">
                  <span className="city-link-title block truncate text-base font-bold leading-tight text-[var(--ink)] transition-colors">
                    {city.displayName}
                  </span>
                  <span className="mt-1 block text-[0.72rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                    {city.districtCount} {city.districtName}
                    {city.districtCount === 1 ? '' : 's'}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
