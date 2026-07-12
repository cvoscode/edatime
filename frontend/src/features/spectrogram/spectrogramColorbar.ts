import type { SpectrogramValueRange } from './spectrogramPointFilter.js';

export interface SpectrogramColorbarUpdate {
    bounds: SpectrogramValueRange;
    label: string;
    palette: readonly string[];
}

export interface SpectrogramColorbarController {
    update(update: SpectrogramColorbarUpdate): void;
    getRange(): SpectrogramValueRange | null;
    resetFilter(): void;
    dispose(): void;
}

interface SpectrogramColorbarOptions {
    root: HTMLElement | null;
    signal: AbortSignal;
    onRangeChange(): void;
}

export function createSpectrogramColorbar({
    root,
    signal,
    onRangeChange,
}: SpectrogramColorbarOptions): SpectrogramColorbarController {
    let bounds: SpectrogramValueRange | null = null;
    let range: SpectrogramValueRange | null = null;
    let dragRaf = 0;
    let disposed = false;
    const highHandle = root?.querySelector<HTMLElement>('[data-role="cb-handle-high"]') ?? null;
    const lowHandle = root?.querySelector<HTMLElement>('[data-role="cb-handle-low"]') ?? null;
    const fill = root?.querySelector<HTMLElement>('[data-role="cb-fill"]') ?? null;

    const cancelScheduledRender = () => {
        if (!dragRaf) return;
        cancelAnimationFrame(dragRaf);
        dragRaf = 0;
    };

    const syncHandles = () => {
        if (!bounds) return;
        const span = bounds.max - bounds.min || 1;
        const active = range && !(range.min <= bounds.min && range.max >= bounds.max);
        if (active && range) {
            const highPct = clampPercent(((bounds.max - range.max) / span) * 100);
            const lowPct = clampPercent(((range.min - bounds.min) / span) * 100);
            if (highHandle) {
                highHandle.style.top = `${highPct}%`;
                highHandle.setAttribute('aria-valuenow', String(Math.round(100 - highPct)));
            }
            if (lowHandle) {
                lowHandle.style.bottom = `${lowPct}%`;
                lowHandle.setAttribute('aria-valuenow', String(Math.round(100 - lowPct)));
            }
            if (fill) {
                fill.hidden = false;
                fill.style.top = `${highPct}%`;
                fill.style.height = `${Math.max(0, 100 - highPct - lowPct)}%`;
            }
            return;
        }
        if (highHandle) {
            highHandle.style.top = '0%';
            highHandle.setAttribute('aria-valuenow', '100');
        }
        if (lowHandle) {
            lowHandle.style.bottom = '0%';
            lowHandle.setAttribute('aria-valuenow', '0');
        }
        if (fill) fill.hidden = true;
    };

    const requestRender = () => {
        cancelScheduledRender();
        dragRaf = requestAnimationFrame(() => {
            dragRaf = 0;
            if (!disposed) onRangeChange();
        });
    };

    const bindHandle = (which: 'high' | 'low', handle: HTMLElement) => {
        handle.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0 || !bounds) return;
            event.preventDefault();
            handle.setAttribute('data-dragging', 'true');
            try { handle.setPointerCapture(event.pointerId); } catch { /* noop */ }
            const startY = event.clientY;
            const startBounds = { ...bounds };
            const startRange = range ? { ...range } : { ...startBounds };
            const minSeparation = (startBounds.max - startBounds.min) * 0.01 || 0.01;

            const onMove = (moveEvent: PointerEvent) => {
                const track = root?.querySelector<HTMLElement>('[data-role="cb-track"]');
                if (!track) return;
                const trackHeight = track.getBoundingClientRect().height || 1;
                const deltaValue = -((moveEvent.clientY - startY) / trackHeight) * (startBounds.max - startBounds.min);
                range = which === 'high'
                    ? {
                        min: startRange.min,
                        max: Math.max(startRange.min + minSeparation, Math.min(startBounds.max, startRange.max + deltaValue)),
                    }
                    : {
                        min: Math.max(startBounds.min, Math.min(startRange.max - minSeparation, startRange.min + deltaValue)),
                        max: startRange.max,
                    };
                syncHandles();
                requestRender();
            };
            const onUp = (upEvent: PointerEvent) => {
                handle.removeAttribute('data-dragging');
                try { handle.releasePointerCapture(upEvent.pointerId); } catch { /* noop */ }
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                cancelScheduledRender();
                if (!disposed) onRangeChange();
            };
            handle.addEventListener('pointermove', onMove, { signal });
            handle.addEventListener('pointerup', onUp, { signal });
            handle.addEventListener('pointercancel', onUp, { signal });
        }, { signal });
    };

    if (highHandle) bindHandle('high', highHandle);
    if (lowHandle) bindHandle('low', lowHandle);
    root?.addEventListener('dblclick', () => {
        if (!range) return;
        range = null;
        syncHandles();
        onRangeChange();
    }, { signal });

    return {
        update({ bounds: nextBounds, label, palette }) {
            bounds = nextBounds;
            const high = root?.querySelector<HTMLElement>('[data-role="cb-high"]');
            const low = root?.querySelector<HTMLElement>('[data-role="cb-low"]');
            const name = root?.querySelector<HTMLElement>('.scatter-colorbar-vname');
            const bar = root?.querySelector<HTMLElement>('.scatter-colorbar-vbar');
            if (bar) bar.style.background = `linear-gradient(to top, ${[...palette].reverse().join(', ')})`;
            if (high) high.textContent = `High · ${formatSpectrogramColorbarNumber(nextBounds.max)}`;
            if (low) low.textContent = `Low · ${formatSpectrogramColorbarNumber(nextBounds.min)}`;
            if (name) name.textContent = label;
            if (root) root.hidden = false;
            syncHandles();
        },
        getRange: () => range,
        resetFilter() {
            range = null;
            syncHandles();
        },
        dispose() {
            disposed = true;
            cancelScheduledRender();
            highHandle?.removeAttribute('data-dragging');
            lowHandle?.removeAttribute('data-dragging');
        },
    };
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function formatSpectrogramColorbarNumber(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    if (absolute !== 0 && (absolute >= 1e4 || absolute < 1e-3)) return value.toExponential(2);
    return value.toFixed(3);
}
