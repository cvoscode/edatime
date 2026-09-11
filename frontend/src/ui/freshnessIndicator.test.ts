import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDataFreshnessIndicator, markDataUpdated } from './freshnessIndicator.js';

describe('data freshness indicator', () => {
    afterEach(() => vi.useRealTimers());

    it('appears after an analysis update and keeps a relative timestamp', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        document.body.innerHTML = `
            <div id="data-freshness-indicator" hidden>
                <span class="data-freshness-time">—</span>
            </div>`;
        const dispose = initDataFreshnessIndicator();

        markDataUpdated();
        expect(document.getElementById('data-freshness-indicator')?.hidden).toBe(false);
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Updated just now');

        vi.advanceTimersByTime(3 * 60_000);
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Updated 3 min ago');
        dispose();
    });
});
