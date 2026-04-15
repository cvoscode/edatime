/**
 * Axis-tick generation and time formatting helpers shared across
 * the main chart and export routines.
 */

const EURO_DATE_ONLY = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const EURO_DATE_TIME = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function formatTwoDecimalsLocal(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function niceNum(range: number, round: boolean): number {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction: number;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
}

export function niceLinearTicks(min: number, max: number, count = 6): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const n = Math.max(2, Math.floor(count));
    const range = niceNum(max - min, false);
    const step = niceNum(range / (n - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    const guard = Math.max(2, Math.min(1024, Math.ceil((niceMax - niceMin) / step) + 2));
    for (let i = 0; i < guard; i++) {
        const v = niceMin + i * step;
        if (v > niceMax + step * 0.5) break;
        ticks.push(v);
    }
    return ticks;
}

export function niceTimeTicks(minMs: number, maxMs: number, count = 6): number[] {
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [];
    const span = maxMs - minMs;
    const n = Math.max(2, Math.floor(count));
    const target = span / (n - 1);
    const steps = [
        1_000, 2_000, 5_000, 10_000, 30_000,
        60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000,
        60 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000,
        86400_000, 2 * 86400_000, 7 * 86400_000, 30 * 86400_000,
    ];
    const step = steps.find((s) => s >= target) ?? steps[steps.length - 1];
    const start = Math.ceil(minMs / step) * step;
    const ticks: number[] = [];
    const guard = Math.max(2, Math.min(2048, Math.ceil((maxMs - start) / step) + 3));
    for (let i = 0; i < guard; i++) {
        const t = start + i * step;
        if (t > maxMs + step * 0.25) break;
        ticks.push(t);
    }
    return ticks;
}

export function formatTimeTick(ms: number, spanMs: number): string {
    try {
        const d = new Date(ms);
        if (!Number.isFinite(d.getTime())) return String(ms);
        if (spanMs <= 2 * 60_000) return EURO_DATE_TIME_SECONDS.format(d);
        if (spanMs <= 2 * 86400_000) return EURO_DATE_TIME.format(d);
        return EURO_DATE_ONLY.format(d);
    } catch {
        return String(ms);
    }
}

export function formatTimeTooltip(ms: number, spanMs: number): string {
    try {
        const d = new Date(ms);
        if (!Number.isFinite(d.getTime())) return String(ms);
        if (spanMs <= 2 * 60_000) return EURO_DATE_TIME_SECONDS.format(d);
        return EURO_DATE_TIME.format(d);
    } catch {
        return String(ms);
    }
}
