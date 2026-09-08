import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initActionProxies, initResponsiveDisclosures } from './responsiveDisclosure.js';
import { initAdaptiveToolbarOverflow } from './adaptiveToolbarOverflow.js';

describe('responsive disclosures', () => {
    beforeEach(() => {
        document.body.innerHTML = '<details data-responsive-collapse="640" open><summary>Tools</summary><button>Tool</button></details>';
    });

    afterEach(() => vi.unstubAllGlobals());

    it('starts compact on a matching narrow viewport', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }));
        const details = document.querySelector('details')!;
        const dispose = initResponsiveDisclosures();
        expect(details.open).toBe(false);
        dispose();
        expect(details.open).toBe(true);
    });

    it('keeps controls expanded on wide viewports', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }));
        const details = document.querySelector('details')!;
        initResponsiveDisclosures();
        expect(details.open).toBe(true);
    });

    it('collapses low-priority controls when their actual groups wrap', () => {
        document.body.innerHTML = `
            <div class="scatter-toolbar">
                <div class="scatter-toolbar__segment">Primary</div>
                <details data-collapse-on-overflow data-toolbar-priority="low" open>
                    <summary>More</summary>
                    <div class="analysis-secondary-disclosure__content">
                        <div class="scatter-toolbar__segment">Secondary</div>
                    </div>
                </details>
            </div>`;
        const toolbar = document.querySelector<HTMLElement>('.scatter-toolbar')!;
        const groups = Array.from(document.querySelectorAll<HTMLElement>('.scatter-toolbar__segment'));
        toolbar.getBoundingClientRect = vi.fn(() => ({ width: 500 } as DOMRect));
        Object.defineProperty(toolbar, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(toolbar, 'scrollWidth', { configurable: true, value: 500 });
        groups.forEach((group, index) => {
            group.getBoundingClientRect = vi.fn(() => ({ top: index * 50 } as DOMRect));
            (group as unknown as { getClientRects: () => DOMRect[] }).getClientRects = vi.fn(() => [{ } as DOMRect]);
        });
        vi.stubGlobal('ResizeObserver', undefined);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        const dispose = initAdaptiveToolbarOverflow();
        const details = document.querySelector<HTMLDetailsElement>('[data-collapse-on-overflow]')!;
        expect(details.dataset.toolbarOverflowed).toBe('true');
        expect(details.open).toBe(false);
        dispose();
        expect(details.open).toBe(true);
    });

    it('forwards compact proxy actions to canonical controls', () => {
        const action = vi.fn();
        document.body.innerHTML = '<button id="canonical"></button><button data-action-proxy="canonical">Proxy</button>';
        document.getElementById('canonical')?.addEventListener('click', action);
        initActionProxies();
        (document.querySelector('[data-action-proxy]') as HTMLButtonElement).click();
        expect(action).toHaveBeenCalledTimes(1);
    });
});
