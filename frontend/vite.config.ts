import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

const __dirname = import.meta.dirname;

const enablePWA = process.env.VITE_BUILD_PWA === 'true';

export default defineConfig({
  root: __dirname,
  plugins: [
    solid(),
    ...(enablePWA ? [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/api\/arrow/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'arrow-data',
                expiration: { maxEntries: 50, maxAgeSeconds: 3600 }
              }
            },
            {
              urlPattern: /\/api\/analytics/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'analytics-data',
                expiration: { maxEntries: 20, maxAgeSeconds: 1800 }
              }
            }
          ]
        }
      })
    ] : [])
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000' }
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: (id) => {
          if (id.includes('node_modules/echarts')) return 'echarts';
          if (id.includes('node_modules/apache-arrow')) return 'arrow';
          if (id.includes('node_modules/solid-js')) return 'solid-runtime';
          if (id.includes('node_modules/@solidjs/router')) return 'solid-router';
          if (id.includes('node_modules/chroma-js')) return 'chroma';
        }
      }
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase'
    }
  }
});