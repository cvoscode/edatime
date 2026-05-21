import type { EventManager } from './createEventManager';
import type { ZoomState } from './createZoomState';
export type InsideZoom = Readonly<{
    enable(): void;
    disable(): void;
    dispose(): void;
}>;
/**
 * Internal “inside” zoom interaction:
 * - wheel zoom centered at cursor-x (only when inside grid)
 * - shift+left drag OR middle-mouse drag pans left/right (only when inside grid)
 * - single-finger touch drag pans left/right (only when inside grid)
 * - two-finger pinch-to-zoom centered at finger midpoint (only when inside grid)
 */
export declare function createInsideZoom(eventManager: EventManager, zoomState: ZoomState): InsideZoom;
//# sourceMappingURL=createInsideZoom.d.ts.map