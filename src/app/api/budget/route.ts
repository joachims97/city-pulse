import { NextRequest, NextResponse } from 'next/server'
import { getBudget } from '@/services/budgetService'
import { getCity } from '@/config/cities'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
  const cityKey = searchParams.get('city') ?? 'chicago'
  const city = getCity(cityKey)

  try {
    const data = await getBudget(city, year)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API /budget]', err)
    return NextResponse.json({ error: 'Failed to load budget' }, { status: 500 })
  }
}
