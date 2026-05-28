# spectrogramPage.ts

Spectrogram visualization page.

## Interfaces

```typescript
interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}
```

## State Variables

```typescript
let loaded: boolean
let spectrogramChart: any
let spectrogramResizeObserver: ResizeObserver | null
let spectrogramResult: SpectrogramResult | null
let spectrogramSampleCount: number
let spectrogramEmptyStateController: ReturnType<typeof createEmptyStateController> | null
```

## Functions

```typescript
function getSpectrogramEmptyStateController(): ReturnType<typeof createEmptyStateController>
```

```typescript
function syncSpectrogramEmptyState(message?: string): void
```

```typescript
function formatSpectrogramTime(timestampMs: number): string
```

```typescript
function formatSpectrogramFrequency(frequency: number): string
```

```typescript
export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void>
```
