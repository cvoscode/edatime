# ai/frontend/src/app/shell/a11yNormalization.md
> Sets `aria-label` on form controls that lack one, using labels, placeholders, or an id-derived fallback.

## Functions
- `humanizeControlId(id: string): string`
  - Converts a kebab/camel/snake id string into a human-readable label (e.g. `my-input` → `My Input`).
- `normalizeFormControlAccessibility(): void`
  - Queries all `input`, `select`, `textarea` elements; sets `name` from `id` if missing; derives `aria-label` from labelledby text, placeholder, title, or a fallback; skips controls that already have `aria-label`.

---
[1]: ../app.md#initAppShell