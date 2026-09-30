# ai/frontend/src/ui/metaBar.md
> Canonical owner for metadata bar DOM helpers (row/column counts).

## Functions
- `setMetaText(text: string): void`
  - Updates the row-count text element using textContent to prevent XSS.

- `buildMetaBar(metadata: { total_rows?: number } | null): void`
  - Renders row and numeric-column counts into the header and page meta bar slots.

---
[deps: ../store/appStateCompat.md][1]> Reconciled 2026-07-16: previously linked `store/appStateCompat.md`; that shim was removed. Use `store/datasetState.ts` directly.
