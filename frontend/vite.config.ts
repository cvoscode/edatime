import { defineConfig } from 'vite';
import { resolve } from 'path';

const apiOrigin = process.env.EDATIME_API_ORIGIN
  || `http://127.0.0.1:${process.env.EDATIME_PORT || '3000'}`;

/**
 * Vite owns the production asset graph.
 *
 * Source files live under frontend/. Production builds emit hashed HTML/CSS/JS
 * directly into the Rust binary's packaged static directory:
 * crates/edatime-bin/frontend/dist.
 */
export default defineConfig({
  root: 'frontend',
  base: '/',
  publicDir: 'public',
  build: {
    outDir: '../crates/edatime-bin/frontend/dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        manualChunks(id) {
          if (id.includes('/utils/settings.')) return 'settings';
          if (id.includes('chartgpu')) return 'chartgpu';
          if (id.includes('apache-arrow') || id.includes('apache_arrow')) return 'arrow';
          if (id.includes('echarts')) return 'echarts';
          return undefined;
        },
      },
    },
    target: 'esnext',
    sourcemap: true,
    minify: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiOrigin, changeOrigin: true },
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
});

// ── Dev server ────────────────────────────────────────────
// Run `npm run dev` from the workspace root to start the Vite dev server.
// Vite proxies /api/* to the Rust backend on port 3000 so you get live data
// while developing with HMR. Open http://localhost:5173 in your browser.
