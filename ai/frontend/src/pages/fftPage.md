# fftPage.ts

FFT analysis page component.

## Interfaces

```typescript
interface FftPageDeps {
    renderTimeseries: () => void;
}
```

## State Variables

```typescript
let initialized: boolean
let fftTraces: FftTrace[]
let fftMode: string
let fftLogScale: boolean
let fftChart: FftChart | null
const fftTraceColors: Record<string, string>
let fftEmptyStateController: ReturnType<typeof createEmptyStateController> | null
```

## Functions

```typescript
function getFftEmptyStateController(): ReturnType<typeof createEmptyStateController>
```

```typescript
function fftColumns(): string[]
```

```typescript
function fftColorFor(column: string, fallbackIndex: number): string
```

```typescript
function updateZoomButton(isZoomed?: boolean): void
```

```typescript
function rerenderOrClear(): void
```

```typescript
async function fetchAndAddTrace(column: string): Promise<void>
```

```typescript
function renderChips(): void
```

```typescript
export async function initFftPage(deps: FftPageDeps): Promise<void>
```
