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
      <body className="min-h-screen bg-white">
        <header className="border-b border-gray-300 bg-white">
          <div className="max-w-screen-xl mx-auto px-4 h-10 flex items-center">
            <a href="/" className="font-bold text-sm text-blue-700 hover:text-blue-900">CityPulse</a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-gray-300 mt-8">
          <div className="max-w-screen-xl mx-auto px-4 py-3 text-xs text-gray-400">
            Data from city open data portals and public sources. Not affiliated with any city government.
          </div>
        </footer>
      </body>
    </html>
  )
}
