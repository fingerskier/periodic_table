import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/periodic_table/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
