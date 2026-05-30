/**
 * ui/metaBar — canonical owner for metadata bar DOM helpers.
 *
 * setMetaText() and buildMetaBar() are isolated here so DOM side-effects
 * stay in ui/ rather than leaking into store/ or state modules.
 */
import { appState } from '../store/appStateCompat.js';

/**
 * Update the row-count text in the analysis status bar.
 * Uses textContent to prevent XSS.
 */
export function setMetaText(text: string): void {
    const el = document.getElementById('stat-rows');
    if (el) el.textContent = text;
}

/**
 * Render the row/column summary into the header and page meta bar slots.
 * Called whenever metadata is loaded or the dataset changes.
 */
export function buildMetaBar(metadata: { total_rows?: number } | null): void {
    const rows = metadata?.total_rows?.toLocaleString() ?? '—';
    const cols = metadata ? String(appState.numericCols?.length ?? 0) : '—';

    const markup = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
    `;

    const headerMeta = document.getElementById('header-meta');
    if (headerMeta) {
        headerMeta.innerHTML = markup;
    }

    const pageMeta = document.getElementById('timeseries-meta-bar');
    if (pageMeta) {
        pageMeta.innerHTML = markup;
    }
}
