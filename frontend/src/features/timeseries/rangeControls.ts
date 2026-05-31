/**
 * features/timeseries/rangeControls — range filter chip rendering.
 *
 * Builds the clickable range chips shown below the column-toggles strip.
 * Each chip opens the column-filter modal for that column.
 */
import { formatAnalysisNumber } from '../../utils/format.js';
import {
    appStateComposite as appState,
    setAdaptiveLineFilters,
    setPendingAdaptivePoint,
} from '../../store/index.js';

/**
 * Render clickable range chips for selected columns and active adaptive filters.
 * Called whenever the selected column set or adaptive filter state changes.
 */
export function buildRangeControls(): void {
    const container = document.getElementById('column-range-controls');
    if (!container) return;
    container.innerHTML = '';

    // Adaptive filter target chip.
    if (appState.adaptiveFilterColumn && appState.selectedCols.includes(appState.adaptiveFilterColumn)) {
        const targetChip = document.createElement('div');
        targetChip.className = 'range-chip';
        targetChip.innerHTML = `
      <span class="name">Adaptive target</span>
      <span class="range">${appState.adaptiveFilterColumn}</span>
    `;
        container.appendChild(targetChip);
    }

    // Per-column range chips.
    for (const col of appState.selectedCols) {
        const range = appState.columnRanges[col];
        if (!range) continue;

        const chip = document.createElement('div');
        chip.className = 'range-chip range-chip--clickable';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', `Filter ${col}`);
        chip.innerHTML = `
      <span class="name">${col}</span>
      <span class="range">${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}</span>
    `;

        const open = () => {
            const fn = window.__edatime?.openFilterForCol;
            if (typeof fn === 'function') fn(col);
        };

        chip.addEventListener('click', open);
        chip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
        container.appendChild(chip);
    }

    // Adaptive line-filter chips.
    for (const filter of appState.adaptiveLineFilters ?? []) {
        const chip = document.createElement('div');
        chip.className = 'range-chip range-chip--clickable';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', `Remove adaptive filter for ${filter.column}`);
        chip.innerHTML = `
      <span class="name">Adaptive ${filter.column}</span>
      <span class="range">${filter.keepAbove ? 'keep above' : 'keep below'}</span>
    `;

        const remove = () => {
            setAdaptiveLineFilters(
                (appState.adaptiveLineFilters ?? []).filter(
                    (item) => (item as unknown as { id?: string }).id !== (filter as unknown as { id?: string }).id,
                ),
            );
            setPendingAdaptivePoint(null);
            buildRangeControls();
            window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
        };

        chip.addEventListener('click', remove);
        chip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(); }
        });
        container.appendChild(chip);
    }

    // Clear-all chip when any adaptive filters are active.
    if ((appState.adaptiveLineFilters?.length ?? 0) > 0 || appState.pendingAdaptivePoint) {
        const clearChip = document.createElement('div');
        clearChip.className = 'range-chip range-chip--clickable';
        clearChip.setAttribute('role', 'button');
        clearChip.setAttribute('tabindex', '0');
        clearChip.setAttribute('aria-label', 'Clear adaptive filters');
        clearChip.innerHTML = `
      <span class="name">Adaptive filters</span>
      <span class="range">Clear all</span>
    `;

        const clearAll = () => {
            setAdaptiveLineFilters([]);
            setPendingAdaptivePoint(null);
            buildRangeControls();
            (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
            window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
        };

        clearChip.addEventListener('click', clearAll);
        clearChip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearAll(); }
        });
        container.appendChild(clearChip);
    }
}