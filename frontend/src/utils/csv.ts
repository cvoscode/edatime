/** Escape a single CSV field using RFC 4180-style quoting. */
export function escapeCsvField(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
}
