import { defineConfig } from 'vite'

// Static, server-less production build for drag-and-drop hosts
// (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.).
//   - base './' so assets resolve from any folder/sub-path
//   - __HOSTED__ removes the LAN multiplayer UI (it needs the node ws server)
// Output lands in dist-static/ (see mk-hosting.ps1 to zip it).
export default defineConfig({
  base: './',
  define: { __HOSTED__: 'true' },
  build: {
    outDir: 'dist-static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
})