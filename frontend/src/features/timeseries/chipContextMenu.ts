/**
 * features/timeseries/chipContextMenu — double-right-click a chip to open its column filter modal.
 *
 * Extracted from buildColumnToggles so the interaction rule stays isolated and
 * reusable without being tied to chip-list composition itself.
 */

import { requestColumnFilterOpen } from './filterModalEvents.js';

export function bindChipContextMenu(container: HTMLElement): void {
    if (container.dataset.ctxBound) return;
    container.dataset.ctxBound = '1';
    let lastContextTs = 0;
    let lastContextCol = '';

    container.addEventListener('contextmenu', (e: MouseEvent) => {
        const chip = (e.target as HTMLElement)?.closest?.('.series-chip');
        if (!chip) return;
        const input = chip.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        const col = input?.value;
        if (!col) return;
        e.preventDefault();
        e.stopPropagation();

        const now = performance.now();
        const isDoubleContext = lastContextCol === col && (now - lastContextTs) <= 450;
        lastContextTs = now;
        lastContextCol = col;
        if (!isDoubleContext) return;

        lastContextTs = 0;
        lastContextCol = '';
        requestColumnFilterOpen(col);
    });
}
