import type { Metadata } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'CityPulse',
  description: 'Open civic data for your city: 311 complaints, permits, inspections, budget, and council legislation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-background-grid" aria-hidden="true" />
        <header className="site-header">
          <div className="site-shell site-header-inner">
            <a href="/" className="site-mark">CityPulse</a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="site-shell site-footer-copy">
            Data from city open data portals and public sources. Not affiliated with any city government.
          </div>
        </footer>
      </body>
    </html>
  )
}
