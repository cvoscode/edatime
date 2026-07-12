import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');

describe('scatter toolbar overflow popout (static)', () => {
    it('hosts an overflow popout inside every segment that has fields', () => {
        const segmentMatches = indexHtml.match(/scatter-toolbar__segment--[a-z]+/g) ?? [];
        const uniqueSegments = Array.from(new Set(segmentMatches));
        expect(uniqueSegments.length).toBeGreaterThanOrEqual(3);
        expect(indexHtml).toContain('class="scatter-toolbar__overflow"');
    });

    it('defines the overflow popout visual treatment in toolbar.css', () => {
        expect(toolbarCss).toContain('.scatter-toolbar__overflow');
        expect(toolbarCss).toContain('.scatter-toolbar__overflow-btn');
        expect(toolbarCss).toContain('.scatter-toolbar__overflow-menu');
        expect(toolbarCss).toMatch(/\.scatter-toolbar__overflow\s*\{[^}]*display:\s*none/s);
        expect(toolbarCss).toMatch(/\.scatter-toolbar__segment\[data-overflow="true"\][^}]*\.scatter-toolbar__overflow\s*\{[^}]*display:\s*inline-flex/s);
    });

    it('gives the overflow popout a high enough z-index to escape the segment', () => {
        expect(toolbarCss).toMatch(/\.scatter-toolbar__overflow-menu\s*\{[^}]*z-index:\s*\d+;[^}]*\}/s);
    });
});

describe('scatter toolbar overflow rebalance logic', () => {
    let toolbar: HTMLElement;
    let originalRO: typeof ResizeObserver | undefined;
    let segment: HTMLElement;
    let body: HTMLElement;
    let overflow: HTMLElement;
    let menu: HTMLElement;
    let fields: HTMLElement[];
    // Imported dynamically in beforeEach so each test gets a fresh
    // module instance and the module-level `segments` registry is
    // reset by the afterEach teardown helper.
    let mod: typeof import('./toolbarOverflow.js');

    beforeEach(async () => {
        // jsdom does not ship ResizeObserver; stub it so init does
        // not crash. The rebalance logic also exposes a
        // synchronous "run now" helper used in these tests so the
        // rebalance is deterministic without depending on the
        // requestAnimationFrame debounce.
        originalRO = (globalThis as any).ResizeObserver;
        (globalThis as any).ResizeObserver = class {
            observe() { /* noop */ }
            unobserve() { /* noop */ }
            disconnect() { /* noop */ }
        };
        // Build a synthetic scatter toolbar with one segment
        // containing three fields and an overflow popout. The
        // rebalance logic uses `offsetTop` to detect wrap; jsdom
        // does not perform layout, so we monkey-patch the relevant
        // properties to simulate a wrapped / unwrapped segment.
        toolbar = document.createElement('div');
        toolbar.className = 'scatter-toolbar';
        segment = document.createElement('div');
        segment.className = 'scatter-toolbar__segment';
        const eyebrow = document.createElement('span');
        eyebrow.className = 'scatter-toolbar__eyebrow';
        eyebrow.textContent = 'X';
        body = document.createElement('div');
        body.className = 'scatter-toolbar__fields';
        fields = ['A', 'B', 'C'].map((label) => {
            const f = document.createElement('label');
            f.className = 'toolbar-field scatter-toolbar__field';
            const text = document.createElement('span');
            text.className = 'toolbar-field__label';
            text.textContent = label;
            f.appendChild(text);
            body.appendChild(f);
            return f;
        });
        overflow = document.createElement('details');
        overflow.className = 'scatter-toolbar__overflow';
        const summary = document.createElement('summary');
        summary.className = 'scatter-toolbar__overflow-btn';
        overflow.appendChild(summary);
        menu = document.createElement('div');
        menu.className = 'scatter-toolbar__overflow-menu';
        overflow.appendChild(menu);
        body.appendChild(overflow);
        segment.appendChild(eyebrow);
        segment.appendChild(body);
        toolbar.appendChild(segment);
        document.body.appendChild(toolbar);
        mod = await import('./toolbarOverflow.js');
    });

    afterEach(() => {
        if (originalRO) {
            (globalThis as any).ResizeObserver = originalRO;
        } else {
            delete (globalThis as any).ResizeObserver;
        }
        if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
        mod._resetScatterToolbarOverflowForTests();
    });

    it('hides the popout when every field fits on one row', () => {
        for (const f of fields) {
            Object.defineProperty(f, 'offsetTop', { configurable: true, value: 0 });
        }
        mod.initScatterToolbarOverflow(toolbar);
        mod._runScatterToolbarOverflowNowForTests();
        expect(segment.hasAttribute('data-overflow')).toBe(false);
        expect(overflow.hidden).toBe(true);
        const inlineFields = body.querySelectorAll(':scope > .scatter-toolbar__field');
        const menuFields = menu.querySelectorAll('.scatter-toolbar__field');
        expect(inlineFields.length).toBe(3);
        expect(menuFields.length).toBe(0);
    });

    it('moves wrapped fields into the popout when the segment is too narrow', () => {
        Object.defineProperty(fields[0], 'offsetTop', { configurable: true, value: 0 });
        Object.defineProperty(fields[1], 'offsetTop', { configurable: true, value: 40 });
        Object.defineProperty(fields[2], 'offsetTop', { configurable: true, value: 40 });
        mod.initScatterToolbarOverflow(toolbar);
        mod._runScatterToolbarOverflowNowForTests();
        expect(segment.getAttribute('data-overflow')).toBe('true');
        expect(overflow.hidden).toBe(false);
        const inlineFields = body.querySelectorAll(':scope > .scatter-toolbar__field');
        const menuFields = menu.querySelectorAll('.scatter-toolbar__field');
        expect(inlineFields.length).toBe(1);
        expect(menuFields.length).toBe(2);
        expect(inlineFields[0]).toBe(fields[0]);
        expect(menuFields[0]).toBe(fields[1]);
        expect(menuFields[1]).toBe(fields[2]);
    });

    it('restores popped fields to the inline row when the segment widens again', () => {
        Object.defineProperty(fields[0], 'offsetTop', { configurable: true, value: 0 });
        Object.defineProperty(fields[1], 'offsetTop', { configurable: true, value: 40 });
        Object.defineProperty(fields[2], 'offsetTop', { configurable: true, value: 40 });
        mod.initScatterToolbarOverflow(toolbar);
        mod._runScatterToolbarOverflowNowForTests();
        // …then widen.
        for (const f of fields) {
            Object.defineProperty(f, 'offsetTop', { configurable: true, value: 0 });
        }
        mod._runScatterToolbarOverflowNowForTests();
        const inlineFields = body.querySelectorAll(':scope > .scatter-toolbar__field');
        const menuFields = menu.querySelectorAll('.scatter-toolbar__field');
        expect(inlineFields.length).toBe(3);
        expect(menuFields.length).toBe(0);
        expect(overflow.hidden).toBe(true);
        expect(segment.hasAttribute('data-overflow')).toBe(false);
    });

    it('updates the popout button label so screen readers know how many fields are hidden', () => {
        Object.defineProperty(fields[0], 'offsetTop', { configurable: true, value: 0 });
        Object.defineProperty(fields[1], 'offsetTop', { configurable: true, value: 40 });
        Object.defineProperty(fields[2], 'offsetTop', { configurable: true, value: 40 });
        mod.initScatterToolbarOverflow(toolbar);
        mod._runScatterToolbarOverflowNowForTests();
        const summary = overflow.querySelector('.scatter-toolbar__overflow-btn')!;
        expect(summary.getAttribute('aria-label')).toBe('2 hidden options');
    });

    it('measures popped fields inline before deciding whether to restore them', () => {
        Object.defineProperty(fields[0], 'offsetTop', { configurable: true, value: 0 });
        for (const field of fields.slice(1)) {
            Object.defineProperty(field, 'offsetTop', {
                configurable: true,
                get() {
                    return this.parentElement === body ? 40 : 0;
                },
            });
        }

        mod.initScatterToolbarOverflow(toolbar);
        mod._runScatterToolbarOverflowNowForTests();
        expect(menu.querySelectorAll('.scatter-toolbar__field').length).toBe(2);

        mod._runScatterToolbarOverflowNowForTests();

        expect(segment.getAttribute('data-overflow')).toBe('true');
        expect(body.querySelectorAll(':scope > .scatter-toolbar__field').length).toBe(1);
        expect(menu.querySelectorAll('.scatter-toolbar__field').length).toBe(2);
    });
});
