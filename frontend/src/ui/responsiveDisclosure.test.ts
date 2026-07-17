import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initActionProxies, initResponsiveDisclosures } from './responsiveDisclosure.js';

describe('responsive disclosures', () => {
    beforeEach(() => {
        document.body.innerHTML = '<details data-responsive-collapse="640" open><summary>Tools</summary><button>Tool</button></details>';
    });

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

    it('forwards compact proxy actions to canonical controls', () => {
        const action = vi.fn();
        document.body.innerHTML = '<button id="canonical"></button><button data-action-proxy="canonical">Proxy</button>';
        document.getElementById('canonical')?.addEventListener('click', action);
        initActionProxies();
        (document.querySelector('[data-action-proxy]') as HTMLButtonElement).click();
        expect(action).toHaveBeenCalledTimes(1);
    });
});
