import type { SeriesConfig } from '../config/types';
import type { ThemeConfig } from '../themes/types';
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';
export interface Legend {
    update(series: ReadonlyArray<SeriesConfig>, theme: ThemeConfig): void;
    dispose(): void;
}
export declare function createLegend(container: HTMLElement, position?: LegendPosition): Legend;
//# sourceMappingURL=createLegend.d.ts.map