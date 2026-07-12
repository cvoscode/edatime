import {
    clampLegendPosition,
    isShiftOnlyGesture,
    LegendWindowListenerScope,
    type LegendDragState,
    type LegendEntry,
    type LegendPosition,
} from './legendInteraction.js';

export interface LegendOverlayCallbacks {
    onToggleTrace(name: string): void;
    suppressChartHover(): void;
}

/**
 * Owns the DOM lifecycle and pointer interaction for the timeseries legend.
 * Chart state (series visibility and export entries) remains in DataChart.
 */
export class LegendOverlayController {
    private element: HTMLElement | null = null;
    private position: LegendPosition | null = null;
    private dragState: LegendDragState | null = null;
    private windowListeners = new LegendWindowListenerScope();

    constructor(
        readonly container: HTMLElement,
        private readonly callbacks: LegendOverlayCallbacks,
    ) {}

    sync(entries: readonly LegendEntry[]): void {
        if (entries.length === 0) {
            this.removeOverlay();
            return;
        }

        const legend = this.ensureOverlay();
        legend.replaceChildren();
        legend.title = 'Legend (click to toggle, Shift+drag to move)';

        const rows = document.createElement('div');
        rows.className = 'timeseries-legend-overlay__rows';
        for (const entry of entries) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'timeseries-legend-overlay__row';
            button.dataset.seriesName = entry.name;
            button.setAttribute('aria-pressed', entry.visible ? 'true' : 'false');
            button.title = `${entry.visible ? 'Hide' : 'Show'} ${entry.name}`;

            const swatch = document.createElement('span');
            swatch.className = 'timeseries-legend-overlay__swatch';
            swatch.style.backgroundColor = entry.color;

            const label = document.createElement('span');
            label.className = 'timeseries-legend-overlay__label';
            label.textContent = entry.name;

            button.append(swatch, label);
            button.addEventListener('click', () => this.callbacks.onToggleTrace(entry.name));
            rows.appendChild(button);
        }
        legend.appendChild(rows);
        this.applyPosition(this.position ?? this.getDefaultPosition());
    }

    reflow(): void {
        if (this.element && this.position) this.applyPosition(this.position);
    }

    destroy(): void {
        this.removeOverlay();
        this.position = null;
    }

    private ensureOverlay(): HTMLElement {
        if (this.element?.isConnected) return this.element;
        if (this.element) this.removeOverlay();

        const legend = document.createElement('div');
        legend.className = 'timeseries-legend-overlay';
        legend.setAttribute('role', 'group');
        legend.setAttribute('aria-label', 'Timeseries trace legend');
        legend.addEventListener('pointerdown', (event) => this.startDrag(event));
        legend.addEventListener('pointermove', (event) => this.moveDrag(event));
        legend.addEventListener('pointerup', (event) => this.finishDrag(event));
        legend.addEventListener('pointercancel', (event) => this.finishDrag(event));
        legend.addEventListener('pointerenter', (event) => this.syncShiftHint(event));

        this.windowListeners.add('keydown', (event) => this.syncShiftHint(event));
        this.windowListeners.add('keyup', (event) => this.syncShiftHint(event));
        this.windowListeners.add('blur', () => {
            this.element?.classList.remove('is-shift-active');
            this.container.classList.remove('is-shift-active');
        });

        this.container.appendChild(legend);
        this.element = legend;
        return legend;
    }

    private removeOverlay(): void {
        this.element?.remove();
        this.element = null;
        this.dragState = null;
        this.windowListeners.dispose();
        this.container.classList.remove('is-shift-active');
    }

    private syncShiftHint(event: Event): void {
        const keyboard = event as KeyboardEvent;
        const pointer = event as PointerEvent;
        const shiftOnly = isShiftOnlyGesture(keyboard) || isShiftOnlyGesture(pointer);
        this.element?.classList.toggle('is-shift-active', shiftOnly);
        this.container.classList.toggle('is-shift-active', shiftOnly);
    }

    private getDefaultPosition(): LegendPosition {
        const legend = this.element;
        if (!legend) return { left: 8, top: 8 };
        return this.clampPosition({
            left: this.container.clientWidth - legend.offsetWidth - 10,
            top: 12,
        });
    }

    private applyPosition(position: LegendPosition): void {
        const legend = this.element;
        if (!legend) return;
        const next = this.clampPosition(position);
        this.position = next;
        legend.style.left = `${next.left}px`;
        legend.style.top = `${next.top}px`;
    }

    private clampPosition(position: LegendPosition): LegendPosition {
        return clampLegendPosition(position, this.container, this.element);
    }

    private startDrag(event: PointerEvent): void {
        const legend = this.element;
        if (event.button !== 0 || !legend || !isShiftOnlyGesture(event)) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.timeseries-legend-overlay__row')) return;
        event.preventDefault();
        this.dragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: this.position?.left ?? legend.offsetLeft,
            startTop: this.position?.top ?? legend.offsetTop,
        };
        legend.classList.add('is-dragging');
        this.callbacks.suppressChartHover();
        try { legend.setPointerCapture(event.pointerId); } catch { /* ignored */ }
    }

    private moveDrag(event: PointerEvent): void {
        const drag = this.dragState;
        if (!drag || drag.pointerId !== event.pointerId) return;
        this.callbacks.suppressChartHover();
        this.applyPosition({
            left: drag.startLeft + event.clientX - drag.startClientX,
            top: drag.startTop + event.clientY - drag.startClientY,
        });
    }

    private finishDrag(event: PointerEvent): void {
        const drag = this.dragState;
        if (!drag || drag.pointerId !== event.pointerId) return;
        this.dragState = null;
        this.element?.classList.remove('is-dragging');
        try { this.element?.releasePointerCapture(event.pointerId); } catch { /* ignored */ }
        this.callbacks.suppressChartHover();
    }
}
