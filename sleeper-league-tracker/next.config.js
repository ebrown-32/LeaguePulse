/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['sleepercdn.com'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig; 