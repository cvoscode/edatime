import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite config for EdaTime frontend migration (esbuild → Vite 6).
 *
 * Design decisions:
 * - root: 'frontend' (where package.json, tsconfig.json, and src/ live)
 * - outDir: 'js' (matches the static path the Rust backend serves)
 * - Entry: src/app.ts (TypeScript entry, no HTML input needed)
 * - entryFileNames: '[name].js' → output is always js/app.js (no hash)
 * - index HTML: the existing frontend/index.html is served as-is by the
 *   Rust backend; it references js/app.js which is the Vite output
 * - Service worker: existing frontend/sw.js is kept as-is (not managed by Vite)
 * - PWA plugin: disabled (existing sw.js handles all caching)
 */
export default defineConfig({
  root: 'frontend',
  // Don't emit index.html — the Rust backend serves frontend/index.html.
  // Vite still processes the root to find index.html for dev server, but
  // build output goes to js/ only.
  publicDir: 'public',
  build: {
    outDir: 'js',
    // Wipe js/ before each build so stale esbuild/PWA artifacts are removed
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'src/app.ts'),
      },
      output: {
        // Flat naming: entry is always 'app.js' (no hash)
        entryFileNames: '[name].js',
        // Vendor + page-level code splitting
        manualChunks(id) {
          if (id.includes('chartgpu')) return 'chartgpu';
          if (id.includes('apache-arrow') || id.includes('apache_arrow')) return 'arrow';
          if (id.includes('echarts')) return 'echarts';
          if (id.includes('/scatter/')) return 'scatter';
          if (id.includes('/causal/')) return 'causal';
          if (id.includes('/drift/')) return 'drift';
          if (
            id.includes('/pages/fft') ||
            id.includes('/pages/heatmap') ||
            id.includes('/pages/spectrogram')
          )
            return 'frequency';
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
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
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