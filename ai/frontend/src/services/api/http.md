# http.ts

HTTP client wrapper with JSON helpers and request deduplication.

## Functions

```typescript
function getJson<T>(
    url: string,
    label: string,
    signal?: AbortSignal,
): Promise<T>

function postJson<T>(
    url: string,
    body: unknown,
    label: string,
    signal?: AbortSignal,
): Promise<T>

function fetchData(
    start: string,
    end: string,
    width: number,
    columns?: string,
    colorColumn?: string | null,
    signal?: AbortSignal,
): Promise<DataObject>

function fetchDriftStats<T>(payload: unknown): Promise<T>
```
