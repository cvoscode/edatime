export {
    EURO_DATE_ONLY,
    EURO_DATE_TIME,
    EURO_DATE_TIME_SECONDS,
    formatTimestamp,
    formatTimeTooltip,
    formatTwoDecimals,
} from '../formatUtils.js';
import { formatTwoDecimals } from '../formatUtils.js';

export function formatAnalysisTime(tsMs: number): string {
    if (!Number.isFinite(tsMs)) return '—';
    return new Date(tsMs).toLocaleString();
}

export const formatAnalysisNumber = formatTwoDecimals;

export function formatCount(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    return Math.round(n).toLocaleString();
}

export function isTemporalDtype(dtype: string): boolean {
    const dt = String(dtype || '').toLowerCase();
    return dt.includes('datetime') || dt === 'date' || dt.startsWith('date[');
}

export function normalizeDtypeLabel(dtype: string): string {
    if (isTemporalDtype(dtype)) return 'datetime[ns]';
    return String(dtype || '');
}

/**
 * Format a profile `min` / `max` value for display.
 *
 * Datetime columns are rendered as UTC ISO 8601 strings (e.g.
 * `2016-07-01T00:00:00Z`) so the rendered value is not affected by the
 * browser's local timezone and never silently shifts away from the actual
 * stored UTC timestamp. The previous behaviour used
 * `d.toLocaleString()` which (a) truncated to local time, (b) got cut off
 * at column widths, and (c) hid the unit-of-time — see `usage_issue.md`
 * §6.1.
 */
export function formatProfileValue(value: unknown, dtype: string): string {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const numeric = Number(value);
    if (isTemporalDtype(dtype)) {
        const d = new Date(numeric);
        if (!Number.isFinite(d.getTime())) return '—';
        // `toISOString()` always produces `YYYY-MM-DDTHH:mm:ss.sssZ`. Strip
        // the trailing milliseconds when they are zero so the cell stays
        // compact.
        const iso = d.toISOString();
        const compact = iso.replace(/\.000Z$/, 'Z');
        return compact;
    }
    return formatAnalysisNumber(numeric);
}

/**
 * Returns the full, untruncated ISO representation of a profile value
 * suitable for the cell's `title` tooltip. Mirrors `formatProfileValue`
 * but never shortens the milliseconds.
 */
export function formatProfileValueTitle(value: unknown, dtype: string): string {
    if (value == null || !Number.isFinite(Number(value))) return '';
    const numeric = Number(value);
    if (isTemporalDtype(dtype)) {
        const d = new Date(numeric);
        if (!Number.isFinite(d.getTime())) return '';
        return `UTC ${d.toISOString()}`;
    }
    return String(value);
}

export function formatToDatetimeLocal(ms: number): string {
    const value = Number(ms);
    if (!Number.isFinite(value)) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toFiniteNumberOrNull(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
