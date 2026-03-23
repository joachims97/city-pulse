/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Prisma client singleton with graceful degradation.
 * Run `npx prisma generate && npx prisma migrate dev` to initialize the DB.
 */

let prismaClient: any = null

function createPrismaClient() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured')
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require('@prisma/adapter-pg')

    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err
    }

    console.warn('[Prisma] Falling back to no-op client:', err)
    return new Proxy(
      {},
      {
        get() {
          return new Proxy(
            {},
            {
              get(_, method) {
                if (method === 'then') return undefined // Not a thenable
                return () => Promise.resolve(null)
              },
            }
          )
        },
      }
    )
  }
}

const globalForPrisma = globalThis as unknown as { prisma: any }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
