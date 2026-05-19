import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    solid({
      ssr: false,
    }) as any,
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});