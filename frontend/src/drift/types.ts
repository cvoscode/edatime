/**
 * drift/types.ts — Shared TypeScript interfaces for drift page modules.
 */

export interface EChartLike {
    setOption: (option: Record<string, unknown>, opts?: Record<string, unknown>) => void;
    clear: () => void;
    resize: () => void;
    on: (event: string, handler: (params: any) => void) => void;
    showLoading?: (type?: string, opts?: Record<string, unknown>) => void;
    hideLoading?: () => void;
    dispatchAction?: (payload: { type: string } & Record<string, unknown>) => void;
    getDataURL?: (opts?: Record<string, unknown>) => string;
}