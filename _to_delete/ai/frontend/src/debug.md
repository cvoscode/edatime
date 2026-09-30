# ai/frontend/src/debug.md
> Shared debug utilities enabled via `?debug=1` query param or `localStorage.edatimeDebug = '1'`.

## Constants
```typescript
export const DEBUG: boolean
```
  - Enables console logging and global error handlers.

## Functions
```typescript
export function dbg(...args: unknown[]): void
export function dbgGroup<T>(label: string, fn?: () => T): T | undefined
```
  - `dbg` logs arguments when DEBUG is active.
  - `dbgGroup` wraps console.groupCollapsed for labeled debug groups.