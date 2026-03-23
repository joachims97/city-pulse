/**
 * Unified cache layer: Redis → Prisma CachedData → fetch
 */
import { prisma } from './prisma'
import { getRedis } from './redis'

export async function getCached<T>(
  cacheKey: string,
  cityKey: string,
  dataType: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
  wardId?: number
): Promise<T> {
  const redis = await getRedis()

  // 1. Check Redis
  const redisHit = await redis.get(cacheKey)
  if (redisHit) {
    try {
      return JSON.parse(redisHit) as T
    } catch {
      // Invalid JSON, continue
    }
  }

  // 2. Check Prisma CachedData
  try {
    const dbCache = await prisma.cachedData.findUnique({
      where: { cacheKey },
    })
    if (dbCache && dbCache.expiresAt > new Date()) {
      const data = dbCache.payload as T
      // Warm Redis
      await redis.setex(cacheKey, ttlSeconds, JSON.stringify(data))
      return data
    }
  } catch {
    // DB not available, continue to fetch
  }

  // 3. Fetch fresh data
  const fresh = await fetcher()

  // 4. Write to both caches
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  const serialized = JSON.stringify(fresh)

  await redis.setex(cacheKey, ttlSeconds, serialized).catch(() => {})

  try {
    await prisma.cachedData.upsert({
      where: { cacheKey },
      update: {
        payload: fresh as object,
        fetchedAt: new Date(),
        expiresAt,
      },
      create: {
        cacheKey,
        cityKey,
        dataType,
        payload: fresh as object,
        expiresAt,
        wardId,
      },
    })
  } catch {
    // DB write failure is non-fatal
  }

  return fresh
}

export async function invalidateCache(prefix: string): Promise<void> {
  const redis = await getRedis()
  const keys = await redis.keys(`${prefix}*`)
  for (const key of keys) {
    await redis.del(key)
  }

  // Also expire DB cache entries
  try {
    await prisma.cachedData.updateMany({
      where: { cacheKey: { startsWith: prefix } },
      data: { expiresAt: new Date(0) },
    })
  } catch {
    // Non-fatal
  }
}
