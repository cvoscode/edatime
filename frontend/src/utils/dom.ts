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
function currentExportPageName(): string | undefined {
    return [...document.querySelectorAll<HTMLElement>('[data-page-name]')]
        .find((page) => !page.hidden)?.dataset.pageName;
}

export function downloadUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const mimeType = url.startsWith('data:') ? url.slice(5, url.indexOf(';') > 0 ? url.indexOf(';') : url.indexOf(',')) : 'application/octet-stream';
    const pageName = currentExportPageName();
    void import('./exportProvenance.js').then(({ recordExportForProvenance }) =>
        recordExportForProvenance(filename, mimeType || 'application/octet-stream', pageName));
}

/** Trigger a browser download for a Blob. Revokes the object URL after a short delay. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const pageName = currentExportPageName();
    void import('./exportProvenance.js').then(({ recordExportForProvenance }) =>
        recordExportForProvenance(filename, blob.type || 'application/octet-stream', pageName));
    // Delay revocation so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Type-safe `getElementById` with a cast. */
export function getEl<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}
