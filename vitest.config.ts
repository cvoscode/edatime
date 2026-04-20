import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['frontend/src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['frontend/src/**/*.ts'],
            exclude: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.d.ts'],
        },
    },
    resolve: {
        extensions: ['.ts', '.js', '.mjs'],
        alias: {
            'apache-arrow': path.resolve(__dirname, 'frontend/src/__mocks__/apache-arrow.ts'),
        },
    },
});
