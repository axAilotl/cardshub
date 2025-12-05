import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  images: {
    remotePatterns: [],
    unoptimized: true,
  },

  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },

  ...(process.env.CLOUDFLARE_PAGES === 'true' ? {
    webpack: (config, { isServer }) => {
      if (isServer) {
        config.externals = config.externals || [];
        if (Array.isArray(config.externals)) {
          config.externals.push('better-sqlite3', 'sharp');
        }
      }
      return config;
    },
  } : {
    serverExternalPackages: ['better-sqlite3', 'tiktoken'],
  }),
};

export default nextConfig;
