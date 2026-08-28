import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from VERSION file at build time
const version = readFileSync(join(process.cwd(), '..', 'VERSION'), 'utf-8').trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.e2b.dev',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_GITPULSE_VERSION: version,
  },
  async headers() {
    return [
      {
        source: '/api/playground/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;