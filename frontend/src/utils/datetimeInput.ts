export function formatUtcDatetimeInputValue(ms: number): string {
    if (!Number.isFinite(ms)) return '';
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Parse a datetime-local control whose visible label explicitly says UTC. */
export function parseUtcDatetimeInputValue(value: string): number {
    const input = value.trim();
    return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input : `${input}Z`);
}
