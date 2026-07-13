export function normalizeSpectrogramInteger(raw: unknown, fallback: number, min: number, max: number): number {
    const value = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function resolveSpectrogramWindowSize(selection: string | null | undefined, customValue: unknown): number {
    if (selection === 'custom') return normalizeSpectrogramInteger(customValue, 96, 16, 4096);
    return normalizeSpectrogramInteger(selection, 96, 16, 4096);
}

export function resolveSpectrogramHopSize(selection: string | null | undefined, customValue: unknown, windowSize: number): number {
    const fallback = Math.max(1, Math.round(windowSize * 0.5));
    if (selection === 'custom') return normalizeSpectrogramInteger(customValue, fallback, 1, windowSize);
    const ratio = Number.parseFloat(selection || '0.5');
    const normalized = Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : 0.5;
    return Math.max(1, Math.min(windowSize, Math.round(windowSize * normalized)));
}

/** DOM state for a custom numeric field associated with a preset dropdown. */
export function resolveSpectrogramCustomInputState(selection: string | null | undefined): {
    hidden: boolean;
    disabled: boolean;
} {
    const enabled = selection === 'custom';
    return { hidden: !enabled, disabled: !enabled };
}
