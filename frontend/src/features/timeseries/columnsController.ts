/**
 * Column toggle chip UI + column range filter controls.
 */

import {
    appStateComposite as appState,
} from '../../store/index.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { buildRangeControls } from './rangeControls.js';
import { bindChipContextMenu } from './chipContextMenu.js';
import { composeChipListItems, bindChipCtrlClick } from './chipComposition.js';
import { initFilterModalController } from './filterModalController.js';

const ADAPTIVE_HINT_DISMISSED_KEY = 'edatime_timeseries_adaptive_hint_dismissed';

export function isAdaptiveHintDismissed(): boolean {
    try {
        return window.localStorage.getItem(ADAPTIVE_HINT_DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

export function setAdaptiveHintDismissed(dismissed: boolean): void {
    try {
        if (dismissed) {
            window.localStorage.setItem(ADAPTIVE_HINT_DISMISSED_KEY, '1');
        } else {
            window.localStorage.removeItem(ADAPTIVE_HINT_DISMISSED_KEY);
        }
    } catch {
        // Ignore storage failures and keep the hint visible for this session.
    }
}

/**
 * Re-render the inline adaptive-filter hint in the chip rail. Re-exposed
 * so out-of-band UI (e.g. the Draw toolbar "?" help button) can restore
 * the hint after the user dismissed it earlier.
 */
export function refreshAdaptiveFilterHint(): void {
    const container = document.getElementById('column-toggles');
    if (container) syncAdaptiveFilterHint(container);
}

// ─── Column toggles (chips) ─────────────────────────────────────────────────

export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn: (() => void) | null = null,
): void {
    const container = document.getElementById('column-toggles');
    if (!container || (container as any)?.dataset?.rebuilding) return;
    container.dataset.rebuilding = '1';
    sanitizeSelectedColumns();
    ensureAdaptiveTargetStillValid();
    container.innerHTML = '';
    const finish = () => { container.dataset.rebuilding = ''; };

    bindChipContextMenu(container);

    const items = composeChipListItems({
        filterText: appState.filterText ?? '',
        buildRangeControlsFn,
        fetchAndRender,
        renderCurrentDataFn,
    });

    if (items.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        finish();
        return;
    }

    renderSeriesChipList({
        container,
        items: items.map((item) => ({ ...item, onToggle: item.onToggle })),
        chipClass: 'timeseries-chip',
        onColorUpdate: (col, color) => {
            const chip = container.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });

    syncAdaptiveFilterHint(container);

    bindChipCtrlClick(
        container,
        () => {
            buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
            buildRangeControlsFn();
        },
        buildRangeControlsFn,
        renderCurrentDataFn,
        fetchAndRender,
    );
    finish();
}

/**
 * Insert or update the inline adaptive-filter hint next to the column
 * chips. The chip tooltips already mention Ctrl+click, but users often
 * miss the gesture; an inline hint makes the interaction discoverable.
 * The hint is anchored to the chip rail so it does not collide with
 * adjacent toolbar groups.
 */
function syncAdaptiveFilterHint(chipContainer: HTMLElement): void {
    const parent = chipContainer.parentElement;
    if (!parent) return;
    let hint = parent.querySelector<HTMLElement>('.timeseries-adaptive-hint');
    if (isAdaptiveHintDismissed()) {
        hint?.remove();
        return;
    }
    if (!hint) {
        hint = document.createElement('span');
        hint.className = 'timeseries-adaptive-hint';
        hint.innerHTML = '<span class="timeseries-adaptive-hint__kbd" aria-hidden="true">Ctrl + click</span><span class="timeseries-adaptive-hint__label">a selected series to add an adaptive line filter</span><button type="button" class="timeseries-adaptive-hint__dismiss" aria-label="Dismiss adaptive filter hint">×</button>';
        hint.querySelector<HTMLButtonElement>('.timeseries-adaptive-hint__dismiss')?.addEventListener('click', () => {
            setAdaptiveHintDismissed(true);
            hint?.remove();
        });
        chipContainer.insertAdjacentElement('afterend', hint);
    }
    // Highlight the current adaptive target so the hint doubles as a
    // status indicator once the user has picked one.
    const target = appState.adaptiveFilterColumn || '';
    if (target) {
        hint.classList.add('timeseries-adaptive-hint--active');
        hint.setAttribute('title', `Adaptive filter target: ${target}. Ctrl+click another chip to switch.`);
    } else {
        hint.classList.remove('timeseries-adaptive-hint--active');
        hint.setAttribute('title', 'Ctrl+click a selected series chip to target adaptive line filters to it.');
    }
}

// ─── Range control chips (delegated) ──────────────────────────────────────────
export { buildRangeControls } from './rangeControls.js';

// ─── Column filter modal ───────────────────────────────────────────────────

export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
): void {
    initFilterModalController({
        renderCurrentData,
        updateAnalysisYRange,
    });
}
