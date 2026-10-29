import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/periodic_table/',
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~600 kB minified; one cacheable bundle is fine for a single-page app.
    chunkSizeWarningLimit: 1000,
  },
});
