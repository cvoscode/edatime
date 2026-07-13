export function correlationColor(value: number, maxAbs = 1): string {
    const domain = Math.max(1e-6, maxAbs);
    const clamped = Math.max(-1, Math.min(1, value / domain));
    if (clamped >= 0) {
        const r = Math.round(245 - clamped * 55);
        const g = Math.round(245 - clamped * 227);
        const b = Math.round(245 - clamped * 199);
        return `rgb(${r},${g},${b})`;
    }
    const t = -clamped;
    return `rgb(${Math.round(245 - t * 210)},${Math.round(245 - t * 133)},${Math.round(245 - t * 65)})`;
}

export function getColorDomainMax(data: (number | null)[][], fitAxis: boolean): number {
    if (!fitAxis) return 1;
    let maxAbs = 0;
    for (let row = 0; row < data.length; row++) {
        for (let col = 0; col < data[row]!.length; col++) {
            if (row === col) continue;
            const value = data[row]![col];
            if (value != null && Number.isFinite(value)) maxAbs = Math.max(maxAbs, Math.abs(value));
        }
    }
    return maxAbs || 1;
}

export function formatScaleTick(value: number): string {
    return Math.abs(value) >= 1 ? value.toFixed(1) : value.toFixed(2);
}

export function correlationToneClass(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'heatmap-cell--missing';
    if (value > 0.08) return 'heatmap-cell--positive';
    if (value < -0.08) return 'heatmap-cell--negative';
    return 'heatmap-cell--neutral';
}

export function correlationTextColor(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'var(--text-dim)';
    return Math.abs(value) >= 0.5 ? '#fff' : '#b8cef8';
}

export function escapeHtmlAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
