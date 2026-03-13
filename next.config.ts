import type { NextConfig } from 'next'
import path from 'path'

const jotaiPath = path.dirname(require.resolve('jotai/package.json'))

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias['jotai'] = jotaiPath
    return config
  },
  experimental: {
    turbo: {
      resolveAlias: {
        jotai: jotaiPath,
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/solana-labs/token-list/**',
      },
      {
        protocol: 'https',
        hostname: 'img-cdn.jup.ag',
      },
      {
        protocol: 'https',
        hostname: 'static.jup.ag',
      },
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
    ],
  },
}

export default nextConfig
