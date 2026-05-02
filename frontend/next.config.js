/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    // In dev: proxy /api/* to the local backend. In production, nginx handles this.
    if (process.env.NODE_ENV === 'development') {
      return [
        { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/:path*` },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
