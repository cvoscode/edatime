// ─── Shared DOM helpers ──────────────────────────────────────────────────────

/** HTML-escape user-supplied text for safe interpolation. */
export function escapeHtml(text: string): string {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Trigger a browser download for an object URL or data URL. */
export function downloadUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/** Trigger a browser download for a Blob. Revokes the object URL after click. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    URL.revokeObjectURL(url);
}

/** Type-safe `getElementById` with a cast. */
export function getEl<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}
