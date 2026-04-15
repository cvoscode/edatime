// ─── Shared date/number formatting utilities ─────────────────────────────────

const EURO_DATE_ONLY = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

const EURO_DATE_TIME = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

/** Format a number to 2 decimal places (locale-aware). Returns '—' for non-finite. */
export function formatTwoDecimals(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a timestamp (ms since epoch), picking resolution based on the visible span. */
export function formatTimestamp(ms: number, spanMs: number): string {
    const n = Number(ms);
    if (!Number.isFinite(n)) return '—';
    try {
        const d = new Date(n);
        if (!Number.isFinite(d.getTime())) return '—';
        if (spanMs <= 2 * 60_000) return EURO_DATE_TIME_SECONDS.format(d);
        if (spanMs <= 2 * 24 * 60 * 60_000) return EURO_DATE_TIME.format(d);
        return EURO_DATE_ONLY.format(d);
    } catch {
        return String(ms);
    }
}


