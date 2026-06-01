/**
 * features/timeseries/chipContextMenu — double-right-click a chip to open its column filter modal.
 *
 * Extracted from buildColumnToggles so the interaction rule stays isolated and
 * reusable without being tied to chip-list composition itself.
 */

let _lastContextTs = 0;
let _lastContextCol = '';

export function bindChipContextMenu(container: HTMLElement): void {
    if (container.dataset.ctxBound) return;
    container.dataset.ctxBound = '1';

    container.addEventListener('contextmenu', (e: MouseEvent) => {
        const chip = (e.target as HTMLElement)?.closest?.('.series-chip');
        if (!chip) return;
        const input = chip.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        const col = input?.value;
        if (!col) return;
        e.preventDefault();
        e.stopPropagation();

        const now = performance.now();
        const isDoubleContext = _lastContextCol === col && (now - _lastContextTs) <= 450;
        _lastContextTs = now;
        _lastContextCol = col;
        if (!isDoubleContext) return;

        _lastContextTs = 0;
        _lastContextCol = '';
        const open = window.__edatime?.openFilterForCol;
        if (typeof open !== 'function') return;
        open(col);
    });
}
