/**
 * Tests for frontend/src/charts/registry.ts
 *
 * Validates the chart type registration system.
 */
import { describe, it, expect } from 'vitest';
import { registerChartType, getChartType } from './registry';

describe('chart registry', () => {
    it('registers and retrieves a chart adapter', () => {
        const mockAdapter = {
            create: () => ({ destroy: () => { } }),
        } as any;

        registerChartType('test-chart', mockAdapter);
        expect(getChartType('test-chart')).toBe(mockAdapter);
    });

    it('returns undefined for unregistered types', () => {
        expect(getChartType('nonexistent')).toBeUndefined();
    });

    it('throws on invalid adapter (no create function)', () => {
        expect(() => registerChartType('bad', {} as any)).toThrow();
    });

    it('throws on empty name', () => {
        const adapter = { create: () => ({}) } as any;
        expect(() => registerChartType('', adapter)).toThrow();
    });

    it('overwrites existing registrations', () => {
        const adapter1 = { create: () => ({ id: 1 }) } as any;
        const adapter2 = { create: () => ({ id: 2 }) } as any;

        registerChartType('replace-test', adapter1);
        registerChartType('replace-test', adapter2);

        expect(getChartType('replace-test')).toBe(adapter2);
    });
});
