# ai/frontend/src/drift/types.md
> Shared TypeScript interfaces for drift page modules.

## Interface: EChartLike
```ts
interface EChartLike {
    setOption: (option: Record<string, unknown>, opts?: Record<string, unknown>) => void;
    clear: () => void;
    resize: () => void;
    dispose: () => void;
    on: (event: string, handler: (params: any) => void) => void;
    showLoading?: (type?: string, opts?: Record<string, unknown>) => void;
    hideLoading?: () => void;
    dispatchAction?: (payload: { type: string } & Record<string, unknown>) => void;
    getDataURL?: (opts?: Record<string, unknown>) => string;
}
```
- Partial ECharts instance interface used by timelineView and detailView for chart initialization and rendering.