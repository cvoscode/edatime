import { defineConfig } from 'vitest/config';
// @ts-ignore - solid plugin type mismatch with bundled vitest vite, runtime works fine
import solid from 'vite-plugin-solid';
import path from 'path';

export default defineConfig({
    plugins: [solid()],
    test: {
        environment: 'happy-dom',
        globals: true,
        include: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            include: ['frontend/src/**/*.ts'],
            exclude: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.d.ts'],
        },
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.mjsx', '.mjs'],
        conditions: ['browser', 'import', 'module', 'default'],
        alias: {
            'apache-arrow': path.resolve(__dirname, 'frontend/src/__mocks__/apache-arrow.ts'),
        },
    },
});
