/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: "../app",
  images: { unoptimized: true },
};

module.exports = nextConfig;
