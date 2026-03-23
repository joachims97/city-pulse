import { NextRequest, NextResponse } from 'next/server'
import { invalidateCache } from '@/lib/cache'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedToken = process.env.REFRESH_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (!expectedToken && isProduction) {
    return NextResponse.json({ error: 'REFRESH_SECRET not configured' }, { status: 500 })
  }

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { cityKey = 'chicago', dataType } = body

    const prefix = dataType
      ? `${cityKey}:${dataType}:`
      : `${cityKey}:`

    await invalidateCache(prefix)

    return NextResponse.json({
      success: true,
      message: `Cache invalidated for prefix: ${prefix}`,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[API /refresh]', err)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
