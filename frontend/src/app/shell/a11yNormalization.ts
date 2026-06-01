function humanizeControlId(id: string): string {
    return String(id || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeFormControlAccessibility(): void {
    const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    controls.forEach((control) => {
        if (!control.name && control.id) {
            control.name = control.id;
        }

        if (control.getAttribute('aria-label')) return;

        const labelledByText = Array.from(control.labels || [])
            .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() || '')
            .filter(Boolean)
            .join(' ');
        const placeholder = control.getAttribute('placeholder') || '';
        const title = control.getAttribute('title') || '';
        const fallback = humanizeControlId(control.id) || (control.type === 'file' ? 'Upload file' : 'Form field');
        const derived = labelledByText || placeholder || title || fallback;
        if (derived) {
            control.setAttribute('aria-label', derived);
        }
    });
}
