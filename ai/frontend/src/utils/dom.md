# dom.ts

Shared DOM manipulation and download utilities.

## Functions

```typescript
function escapeHtml(text: string): string
```

HTML-escape user-supplied text for safe interpolation.

```typescript
function downloadUrl(url: string, filename: string): void
```

Trigger a browser download for an object URL or data URL.

```typescript
function downloadBlob(blob: Blob, filename: string): void
```

Trigger a browser download for a Blob.

```typescript
function getEl<T extends HTMLElement = HTMLElement>(id: string): T | null
```

Type-safe getElementById with a cast.

```typescript
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T
```

Simple debounce: delays fn until ms milliseconds after the last call.