/**
 * Redis client with graceful fallback to an in-memory mock.
 * The app works without Redis — set REDIS_URL to enable caching.
 */

interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  setex(key: string, ttl: number, value: string): Promise<unknown>
  del(key: string): Promise<unknown>
  keys(pattern: string): Promise<string[]>
}

class MockRedis implements RedisClient {
  private store = new Map<string, { value: string; exp: number }>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.exp > 0 && Date.now() > entry.exp) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value, exp: 0 })
    return 'OK'
  }

  async setex(key: string, ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, exp: Date.now() + ttl * 1000 })
    return 'OK'
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return Array.from(this.store.keys()).filter((k) => regex.test(k))
  }
}

let redisClient: RedisClient

async function createRedisClient(): Promise<RedisClient> {
  if (!process.env.REDIS_URL) {
    return new MockRedis()
  }

  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    })

    await client.connect()
    console.log('[Redis] Connected')
    return client as unknown as RedisClient
  } catch {
    console.warn('[Redis] Connection failed, using in-memory mock')
    return new MockRedis()
  }
}

const globalForRedis = globalThis as unknown as { redis: RedisClient | undefined }

export async function getRedis(): Promise<RedisClient> {
  if (!globalForRedis.redis) {
    globalForRedis.redis = await createRedisClient()
  }
  return globalForRedis.redis
}

export { MockRedis }
