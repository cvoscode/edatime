import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        include: ['frontend/src/**/*.test.ts', 'scripts/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['frontend/src/**/*.ts'],
            exclude: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.d.ts'],
        },
    },
    resolve: {
        extensions: ['.ts', '.js', '.mjs'],
        conditions: ['browser', 'import', 'module', 'default'],
        alias: {
            'apache-arrow': path.resolve(__dirname, 'frontend/src/__mocks__/apache-arrow.ts'),
        },
    },
});
