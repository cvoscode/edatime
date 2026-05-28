# ai/frontend/src/debug.ts
> Shared debug utilities enabled via `?debug=1` query param or `localStorage.edatimeDebug = '1'`.

## Constants

```typescript
export const DEBUG: boolean
```

## Functions

```typescript
export function dbg(...args: unknown[]): void
export function dbgGroup<T>(label: string, fn?: () => T): T | undefined
```