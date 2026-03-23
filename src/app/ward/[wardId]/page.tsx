import { redirect } from 'next/navigation'

interface Props {
  params: { wardId: string }
  searchParams: { address?: string; lat?: string; lng?: string }
}

// Redirect legacy /ward/N URLs to /chicago/ward/N
export default function LegacyWardPage({ params, searchParams }: Props) {
  const qs = new URLSearchParams()
  if (searchParams.address) qs.set('address', searchParams.address)
  if (searchParams.lat) qs.set('lat', searchParams.lat)
  if (searchParams.lng) qs.set('lng', searchParams.lng)
  const query = qs.toString() ? `?${qs.toString()}` : ''
  redirect(`/chicago/ward/${params.wardId}${query}`)
}
