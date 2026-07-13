/**
 * Explicit bridge from chart interaction policy to the page-owned render
 * pipeline. Keeping this small module between rendering and page orchestration
 * avoids a circular import without publishing behavior on `globalThis`.
 */
export interface ScatterRenderScheduleOptions {
    preserveView?: boolean;
    immediate?: boolean;
}

export type ScatterRenderScheduler = (options?: ScatterRenderScheduleOptions) => void;

let scheduler: ScatterRenderScheduler | null = null;

export function setScatterRenderScheduler(next: ScatterRenderScheduler | null): void {
    scheduler = next;
}

export function scheduleScatterRender(options: ScatterRenderScheduleOptions = {}): boolean {
    if (!scheduler) return false;
    scheduler(options);
    return true;
}
