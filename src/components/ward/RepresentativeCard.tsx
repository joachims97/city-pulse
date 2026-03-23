import type { RepresentativeData } from '@/services/wardService'

export default function RepresentativeCard({
  rep,
  districtName = 'District',
}: {
  rep: RepresentativeData
  districtName?: string
}) {
  return (
    <div className="panel panel-dark panel-accent-yellow">
      <div className="panel-header">
        <span>Representative</span>
      </div>
      <div className="px-5 pb-5 pt-4">
        <div className="mb-3 flex items-center gap-3">
          {rep.photoUrl ? (
            <img
              src={rep.photoUrl}
              alt={rep.name}
              className="h-12 w-12 flex-shrink-0 border border-[rgba(243,239,229,0.24)] object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center border border-[rgba(243,239,229,0.24)] bg-[rgba(255,255,255,0.08)] text-sm font-bold text-[var(--panel)]">
              {rep.name.split(' ').slice(-1)[0]?.[0] ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-none text-[var(--panel)]">{rep.name}</p>
            <p className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-[rgba(243,239,229,0.68)]">
              {rep.title}
            </p>
          </div>
          {rep.party && (
            <span className="tag tag-blue ml-auto flex-shrink-0">{rep.party}</span>
          )}
        </div>

        <div className="space-y-2 text-[0.8rem] leading-6 text-[rgba(243,239,229,0.82)]">
          {rep.phone && (
            <div>
              <a href={`tel:${rep.phone}`} className="action-link-light !text-[0.72rem]">
                {rep.phone}
              </a>
            </div>
          )}
          {rep.email && (
            <div className="truncate">
              <a href={`mailto:${rep.email}`} className="action-link-light !text-[0.72rem]">
                {rep.email}
              </a>
            </div>
          )}
          {rep.website && (
            <div>
              <a href={rep.website} target="_blank" rel="noopener noreferrer" className="action-link-light !text-[0.72rem]">
                {districtName} website
              </a>
            </div>
          )}
          {rep.officeAddr && (
            <div className="border-t border-[rgba(243,239,229,0.18)] pt-3 text-[rgba(243,239,229,0.72)]">{rep.officeAddr}</div>
          )}
          {rep.nextElection && (
            <div className="pt-1">
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(243,239,229,0.54)]">
                Next election
              </span>{' '}
              <span className="text-[var(--panel)]">{rep.nextElection}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
