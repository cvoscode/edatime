# driftPage.ts

Data drift detection page with temporal distribution analysis, timeline box summaries, and interactive detail views.

## Interfaces

```typescript
interface WindowDistributionStats {
    start_ms: number;
    end_ms: number;
    label: string;
    count: number;
    null_count: number;
    completeness: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    quantiles: number[];
    hist_bins: number[];
    hist_counts: number[];
    ecdf_x: number[];
    ecdf_y: number[];
}

interface DriftWindowStats extends WindowDistributionStats {
    ks_stat: number;
    ks_pvalue: number;
    es_stat: number;
    es_pvalue: number;
    wasserstein: number;
    psi: number;
    drift_level: 'green' | 'yellow' | 'red';
    low_sample_warning: boolean;
}

interface DriftResponse {
    column: string;
    reference: WindowDistributionStats;
    windows: DriftWindowStats[];
    thresholds: {
        ks_threshold: number;
        wasserstein_threshold: number;
        psi_minor_threshold: number;
        psi_major_threshold: number;
    };
    metadata?: {
        computation_time_ms: number;
        num_windows: number;
        reference_samples: number;
        bin_count_warning?: boolean;
        effective_bins?: number;
        psi_sample_ratio_warning?: boolean;
        avg_window_samples?: number;
    };
}

interface EChartLike {
    setOption: (option: Record<string, unknown>, opts?: Record<string, unknown>) => void;
    clear: () => void;
    resize: () => void;
    on: (event: string, handler: (params: any) => void) => void;
    showLoading?: (type?: string, opts?: Record<string, unknown>) => void;
    hideLoading?: () => void;
    dispatchAction?: (payload: { type: string } & Record<string, unknown>) => void;
    getDataURL?: (opts?: Record<string, unknown>) => string;
}
```

## Constants

```typescript
COLOR_GREEN: '#00C896'
COLOR_YELLOW: '#FFC041'
COLOR_RED: '#FF6B6B'
COLOR_DIM: 'rgba(120,139,174,0.35)'
COLOR_REF: 'rgba(0,168,255,0.85)'
COLOR_TEXT: '#D2DAF0'
COLOR_TEXT_DIM: '#788BAE'
COLUMN_PALETTE: string[]
```

## Module-Level Variables

```typescript
let _echartsModule: typeof import('echarts') | null
let _pendingFullReset: boolean
```

## Functions

```typescript
function getECharts(): Promise<typeof import('echarts')>
function _setEchartsModule(m: typeof import('echarts') | null): void
function driftColor(level: string): string
function formatValue(v: number): string
function toDatetimeLocal(ms: number): string
function hashColor(text: string, fallbackIndex: number): string
function normalizeDensity(stats: WindowDistributionStats): Array<[number, number]>
function initDriftPage(metadata: any): Promise<void>
```

## Internal Functions (initDriftPage scope)

```typescript
function syncPickerLabel(): void
function syncHiddenSelect(allCols: string[]): void
function getCheckboxes(): NodeListOf<HTMLInputElement>
function syncCheckboxes(): void
function repopulateColumnSelect(nextColumns: string[]): void
function openPicker(): void
function closePicker(): void
function getSelectedColumns(): string[]
function applyReferencePreset(preset: string): void
function isRenderable(element: HTMLElement | null): boolean
function isDriftChartReadyForInit(): boolean
function ensureCharts(): void
function ensureChartsAsync(): Promise<void>
function scheduleDriftChartRefresh(attempts?: number): void
function getActiveResponse(): DriftResponse | null
function severityScore(level: DriftWindowStats['drift_level']): number
function sortedWindowIndices(response: DriftResponse): number[]
function syncEmptyState(show: boolean, message?: string): void
function updateDetailColumnSelect(): void
function timelineOption(): Record<string, unknown>
function detailOption(plotType: string): Record<string, unknown>
function renderTimeline(): void
function renderDetail(): void
function renderWindowList(): void
function updateDetailStats(): void
function statusSummary(failedColumns?: string[]): void
function runCompute(): Promise<void>
function exportDriftCsv(): void
function exportDriftJson(): void
```
