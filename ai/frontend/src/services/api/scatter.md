# scatter.ts

Scatter plot API client for correlation and point data.

## Functions

```typescript
function fetchScatterPoints(
    x: string,
    y: string,
    limit?: number,
    color?: string | null,
    options?: ScatterFetchOptions | null,
    signal?: AbortSignal,
): Promise<ScatterPointsResponse>

function fetchScatterCorrelations(
    base?: string | null,
    threshold?: number,
): Promise<ScatterCorrelationsResponse>
```

## Types

```typescript
interface ScatterCorrelationsResponse {
    correlations: unknown[];
}

interface ScatterFetchOptions {
    start?: number;
    end?: number;
    filters?: unknown[];
    lineFilters?: unknown[];
}

interface ScatterPointsResponse {
    x: string;
    y: string;
    color: string | null;
    total_points: number;
    returned_points: number;
    points: [number, number][];
    color_values: number[] | null;
    color_labels: (string | null)[] | null;
    color_min: number | null;
    color_max: number | null;
}
```
