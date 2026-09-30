# ai/frontend/src/utils/toast.md

> Shared toast notification system with auto-dismiss, deduplication, and optional action buttons.

## Types
```typescript
type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastOptions {
    duration?: number;
    action?: { label: string; onClick: () => void };
    dedupeKey?: string;
}
```

## Constants
- `DEFAULT_DURATIONS: Record<ToastKind, number>` — default auto-dismiss delays (error = sticky).
- `TOAST_ICONS: Record<ToastKind, string>` — icons mapped to each toast kind.

## Functions
- `toast(message: string, kind?: ToastKind, durationOrOpts?: number | ToastOptions): void`
  - Shows a toast notification with the given message, kind, and options.