# ai/frontend/src/utils/dom.md

> Shared DOM manipulation helpers: HTML escaping, download triggering, element retrieval, and debouncing.

## Functions
- `escapeHtml(text: string): string`
  - HTML-escapes user-supplied text for safe interpolation.
- `downloadUrl(url: string, filename: string): void`
  - Triggers a browser download for a data URL or object URL.
- `downloadBlob(blob: Blob, filename: string): void`
  - Triggers a browser download for a Blob, revoking the object URL after a short delay.
- `getEl<T extends HTMLElement = HTMLElement>(id: string): T | null`
  - Type-safe `getElementById` with a cast.
- `debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T`
  - Returns a debounced version of `fn` that delays execution until `ms` ms have elapsed since the last call.