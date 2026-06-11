/**
 * ui/metaBar — canonical owner for the page-level metadata status bar
 * (rows / numeric series) shown in the timeseries page header.
 *
 * The bar is populated by:
 *   - `setMetaText()` for the live status line under the chart
 *   - `buildMetaBar()` for the static row/series counters in the header
 *
 * Both helpers read from the composite `appState` via `store/appStateCompat.js`
 * and write to the well-known DOM ids:
 *   - `#stat-rows`            (live status line)
 *   - `#header-meta`          (rows counter)
 *   - `#timeseries-meta-bar`  (numeric series counter)
 */
import { appState } from '../store/appStateCompat.js';

export function setMetaText(text: string): void {
    const el = document.getElementById('stat-rows');
    if (el) el.textContent = text;
}

interface MetaBarMetadata {
    total_rows?: number | null;
}

export function buildMetaBar(metadata: MetaBarMetadata | null): void {
    const rows = metadata?.total_rows != null
        ? Number(metadata.total_rows).toLocaleString()
        : '—';
    const cols = metadata
        ? String(appState.numericCols?.length ?? 0)
        : '—';
    const markup = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
    `;
    document.getElementById('header-meta')?.replaceChildren();
    const bar = document.getElementById('timeseries-meta-bar');
    if (bar) {
        bar.innerHTML = markup;
    }
}
