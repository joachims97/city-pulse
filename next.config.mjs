/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages should stay server-side in the Vercel build.
  experimental: {
    serverComponentsExternalPackages: [
      'ioredis',
      '@prisma/client',
      'prisma',
      'pdf-parse',
      'pdfjs-dist',
      '@napi-rs/canvas',
    ],
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
}

export default nextConfig
