import { getAllCities } from '@/config/cities'

export default function Home() {
  const cities = getAllCities()

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-4">
        <p className="text-xs text-gray-500">Open civic data by district — 311 complaints · permits · inspections · budget · council legislation</p>
      </div>

      <div className="border border-gray-300">
        <div className="bg-gray-100 border-b border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Select a City
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-3 py-1.5 font-medium">City</th>
              <th className="text-left px-3 py-1.5 font-medium">State</th>
              <th className="text-left px-3 py-1.5 font-medium">Districts</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((city, i) => (
              <tr key={city.key} className={`border-b border-gray-200 hover:bg-blue-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-3 py-1.5">
                  <a href={`/${city.key}`} className="text-blue-700 hover:underline font-medium">
                    {city.displayName}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-gray-600">{city.state}</td>
                <td className="px-3 py-1.5 text-gray-600">{city.districtCount} {city.districtName}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
