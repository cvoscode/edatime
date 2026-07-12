export interface LegendPosition {
    left: number;
    top: number;
}

export interface LegendEntry { name: string; color: string; visible: boolean }

export class LegendWindowListenerScope {
    private listeners: { type: string; handler: EventListener }[] = [];

    add(type: string, handler: EventListener): void {
        this.listeners.push({ type, handler });
        window.addEventListener(type, handler);
    }

    dispose(): void {
        for (const { type, handler } of this.listeners) window.removeEventListener(type, handler);
        this.listeners = [];
    }
}

export function buildLegendEntries(
    series: readonly { type?: string; name?: string; color?: string; visible?: boolean }[],
    palette: readonly string[],
    baseName: (name: string) => string,
): LegendEntry[] {
    const byName = new Map<string, { name: string; color: string; visible: boolean }>();
    for (const item of series) {
        if (item.type !== 'line' || !item.name || item.name.endsWith('__markers')) continue;
        const name = baseName(item.name);
        if (!name) continue;
        const existing = byName.get(name);
        if (existing) { existing.visible ||= item.visible !== false; continue; }
        byName.set(name, { name, color: item.color || palette[byName.size % palette.length] || '#000000', visible: item.visible !== false });
    }
    return [...byName.values()];
}

export function clampLegendPosition(
    position: LegendPosition,
    container: Pick<HTMLElement, 'clientWidth' | 'clientHeight'> | null,
    legend: Pick<HTMLElement, 'offsetWidth' | 'offsetHeight'> | null,
): LegendPosition {
    if (!container || !legend) return { left: 8, top: 8 };
    const margin = 8;
    const maxLeft = Math.max(margin, container.clientWidth - legend.offsetWidth - margin);
    const maxTop = Math.max(margin, container.clientHeight - legend.offsetHeight - margin);
    return {
        left: Math.min(maxLeft, Math.max(margin, Math.round(position.left))),
        top: Math.min(maxTop, Math.max(margin, Math.round(position.top))),
    };
}

export function isShiftOnlyGesture(event: Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
    return event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}
