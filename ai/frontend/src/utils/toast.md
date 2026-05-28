# toast.ts

Shared toast notification system with auto-dismiss, dedupe, and action button support.

## Types

```typescript
type ToastKind = 'success' | 'error' | 'warning' | 'info'
```

```typescript
interface ToastOptions {
    duration?: number;
    action?: { label: string; onClick: () => void };
    dedupeKey?: string;
}
```

## Functions

```typescript
function dismissAllToasts(): void
```

Dismiss all active toasts.

```typescript
function toast(message: string, kind?: ToastKind, durationOrOpts?: number | ToastOptions): () => void
```

Show a toast notification. Returns a dismiss function.