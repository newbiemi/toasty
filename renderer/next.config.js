/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Prod (`nextron build`) needs the exported static site sitting in ../app
  // alongside the compiled main process, since electron-builder packages
  // "app/**/*" as one unit. Dev (`nextron`/`next dev`) doesn't export anything
  // static — it serves live over HTTP — so pointing distDir there too just
  // means Next's dev-server bookkeeping (build-manifest.json, cache/, etc.)
  // collides with nextron's main-process webpack output in the same folder,
  // intermittently deleting/never-writing app/background.js before Electron
  // tries to load it ("Cannot find module app/background.js" on cold start).
  distDir: process.env.NODE_ENV === "production" ? "../app" : ".next",
  images: { unoptimized: true },
};

module.exports = nextConfig;
