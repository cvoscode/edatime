function humanizeControlId(id: string): string {
    return String(id || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeFormControlAccessibility(): void {
    const controls = document.querySelectorAll<HTMLElement>('input, select, textarea, .dropdown__trigger');
    controls.forEach((control) => {
        if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
            if (!control.name && control.id) {
                control.name = control.id;
            }
        }

        if (control.getAttribute('aria-label')) return;

        const labelledByText = control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
            ? Array.from(control.labels || [])
                .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() || '')
                .filter(Boolean)
                .join(' ')
            : '';
        const placeholder = control.getAttribute('placeholder') || '';
        const title = control.getAttribute('title') || '';
        const fallback = humanizeControlId(control.id)
            || ((control instanceof HTMLInputElement && control.type === 'file') ? 'Upload file' : 'Form field');
        const derived = labelledByText || placeholder || title || fallback;
        if (derived) {
            control.setAttribute('aria-label', derived);
        }
    });
}
