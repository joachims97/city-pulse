/** @type {import('next').NextConfig} */
const nextConfig = {
  // ioredis must stay server-side (Next.js 14 uses 'experimental.serverComponentsExternalPackages')
  experimental: {
    serverComponentsExternalPackages: ['ioredis', '@prisma/client', 'prisma'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.chicago.gov',
      },
      {
        protocol: 'https',
        hostname: '**.usgovcloudapi.net',
      },
    ],
  },

  transpilePackages: ['react-leaflet'],
}

export default nextConfig
