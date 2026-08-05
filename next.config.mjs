/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint config ships with this project; don't let linting gate the build.
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
