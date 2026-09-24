/** Signals toolbar presentation and disclosure lifecycle. Chart actions keep their existing owners. */
import { getAnnotationsForPage } from '../../chart/annotations.js';
import { analyticsState } from '../../store/analyticsState.js';
import { subscribe as subscribeStore } from '../../store/events.js';
import { getDropdownValue } from '../../ui/primitives/Dropdown.js';
import { initToolbarPopovers } from '../../ui/toolbarPopovers.js';
import type { TimeseriesWorkspace } from './selectionIntent.js';

interface SignalsToolbarDeps {
    workspace: TimeseriesWorkspace;
    renderCurrentData: () => void;
}

export function initSignalsToolbar({ workspace, renderCurrentData }: SignalsToolbarDeps): () => void {
    const root = document.getElementById('timeseries-chart-toolbar');
    if (!root) return () => {};

    const lifetime = new AbortController();
    const options = { signal: lifetime.signal };
    const cleanups: Array<() => void> = [];
    const popovers = initToolbarPopovers(root, {
        selector: '[data-signals-popover]',
        closeOnAction: '.signals-toolbar__export button',
    });
    const normalize = root.querySelector<HTMLInputElement>('#timeseries-normalize-series');
    root.querySelector('#quick-range-custom-apply')?.addEventListener('click', () => {
        const custom = root.querySelector<HTMLDetailsElement>('#quick-range-custom');
        // The range owner closes only after successful validation.
        queueMicrotask(() => {
            if (!lifetime.signal.aborted && custom && !custom.open) popovers.close(custom, true);
        });
    }, options);
    normalize?.addEventListener('change', () => renderCurrentData(), options);

    const sync = () => {
        const snapshot = workspace.getSnapshot();
        const drawing = getDropdownValue('draw-tool');
        const mode = root.querySelector<HTMLElement>('#timeseries-draw-mode');
        if (mode) {
            mode.hidden = !drawing || drawing === 'none';
            mode.textContent = drawing === 'box' ? 'Box' : 'Arrow';
        }
        const labelState = root.querySelector<HTMLElement>('[data-signals-state="labels"]');
        if (labelState) labelState.hidden = !Object.values(snapshot.appearance.chartText).some((value) => value.trim());
        const notes = getAnnotationsForPage('timeseries').length;
        const noteState = root.querySelector<HTMLElement>('[data-signals-state="notes"]');
        if (noteState) {
            noteState.hidden = notes === 0;
            noteState.textContent = String(notes);
            noteState.setAttribute('aria-label', `${notes} annotation${notes === 1 ? '' : 's'}`);
        }
        const analytics = root.querySelector<HTMLElement>('[data-signals-state="analytics"]');
        if (analytics) analytics.hidden = !(analyticsState.rollingEnabled || analyticsState.anomalyEnabled || analyticsState.spectralFilterPreview);

        const columns = Object.keys(snapshot.filters.columnRanges);
        const adaptiveCount = snapshot.filters.adaptiveLines.length;
        const filterCount = columns.length + adaptiveCount;
        const status = root.querySelector<HTMLElement>('#timeseries-filter-status');
        if (status) {
            status.hidden = filterCount === 0;
            const label = `${filterCount} active filter${filterCount === 1 ? '' : 's'}`;
            if (status.textContent !== label) status.textContent = label;
            status.title = [columns.length ? `Column ranges: ${columns.join(', ')}` : '',
                adaptiveCount ? `${adaptiveCount} adaptive line filter${adaptiveCount === 1 ? '' : 's'}` : ''].filter(Boolean).join('; ');
        }

        const range = snapshot.dataset.metadata?.time_range;
        const min = Number(range?.min);
        const max = Number(range?.max);
        const start = snapshot.viewport?.xMin ?? min;
        const end = snapshot.viewport?.xMax ?? max;
        let matchedPreset = false;
        // Prefer All when a short dataset also fits one of the duration presets.
        for (const [id, days] of [['all', null], ['24h', 1], ['7d', 7], ['30d', 30]] as const) {
            const expectedStart = days === null ? min : Math.max(min, max - days * 86_400_000);
            const active: boolean = !!range && !matchedPreset && start === expectedStart && end === max;
            root.querySelector(`#quick-range-${id}`)?.setAttribute('aria-pressed', String(active));
            matchedPreset ||= active;
        }
        root.querySelector('#quick-range-custom > summary')?.toggleAttribute('data-active', !!range && !matchedPreset);
    };

    root.addEventListener('input', sync, options);
    root.addEventListener('change', sync, options);
    window.addEventListener('edatime:annotations-changed', sync, options);
    if (workspace.subscribe) cleanups.push(workspace.subscribe(sync));
    for (const event of ['analytics:rollingEnabled', 'analytics:anomalyEnabled', 'analytics:spectralFilterPreview'] as const) {
        cleanups.push(subscribeStore(event, sync));
    }
    sync();

    return () => {
        lifetime.abort();
        cleanups.forEach((cleanup) => cleanup());
        popovers.dispose();
    };
}
