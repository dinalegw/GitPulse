import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from VERSION file at build time
const version = readFileSync(join(process.cwd(), '..', 'VERSION'), 'utf-8').trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_GITPULSE_VERSION: version,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
