export interface LegendPosition {
    left: number;
    top: number;
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
