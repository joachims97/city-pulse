import type { RepresentativeData } from '@/services/wardService'

export default function RepresentativeCard({
  rep,
  districtName = 'District',
}: {
  rep: RepresentativeData
  districtName?: string
}) {
  return (
    <div className="panel">
      <div className="panel-header">Representative</div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          {rep.photoUrl ? (
            <img
              src={rep.photoUrl}
              alt={rep.name}
              className="w-8 h-8 object-cover border border-gray-300 flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 bg-gray-200 border border-gray-300 flex-shrink-0 flex items-center justify-center text-xs font-medium text-gray-600">
              {rep.name.split(' ').slice(-1)[0]?.[0] ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{rep.name}</p>
            <p className="text-xs text-gray-500">{rep.title}</p>
          </div>
          {rep.party && (
            <span className="tag tag-blue ml-auto flex-shrink-0">{rep.party}</span>
          )}
        </div>

        <div className="text-xs text-gray-600 space-y-0.5">
          {rep.phone && (
            <div>
              <a href={`tel:${rep.phone}`} className="text-blue-700 hover:underline">{rep.phone}</a>
            </div>
          )}
          {rep.email && (
            <div className="truncate">
              <a href={`mailto:${rep.email}`} className="text-blue-700 hover:underline">{rep.email}</a>
            </div>
          )}
          {rep.website && (
            <div>
              <a href={rep.website} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                {districtName} website
              </a>
            </div>
          )}
          {rep.officeAddr && (
            <div className="text-gray-500">{rep.officeAddr}</div>
          )}
          {rep.nextElection && (
            <div className="text-gray-500 pt-1">Next election: <span className="text-gray-700">{rep.nextElection}</span></div>
          )}
        </div>
      </div>
    </div>
  )
}
