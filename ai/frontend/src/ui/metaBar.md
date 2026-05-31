# ai/frontend/src/ui/metaBar.md
> Canonical owner for metadata bar DOM helpers (row/column counts).

## Functions
- `setMetaText(text: string): void`
  - Updates the row-count text element using textContent to prevent XSS.

- `buildMetaBar(metadata: { total_rows?: number } | null): void`
  - Renders row and numeric-column counts into the header and page meta bar slots.

---
[deps: ../store/appStateCompat.md][1]