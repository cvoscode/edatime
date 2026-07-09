/**
 * globalShortcuts — global keyboard shortcuts that are always active.
 *
 * Extracted from app.ts to keep the orchestrator slim.
 * Page-specific shortcuts (e.g. timeseries Shift+R/Z/C) remain in app.ts
 * since they depend on timeseries-specific deps.
 */

export interface GlobalShortcutsDeps {
    showPage: (page: string) => void;
    openCommands: () => Promise<void>;
    openSettings: () => Promise<void>;
    registerCleanup: (cleanup: () => void) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

let shortcutsBound = false;

const ALT_NAVIGATION: Record<string, string> = {
    '1': 'upload',
    '2': 'timeseries',
    '3': 'scatter',
    '4': 'scattermatrix',
    '6': 'fft',
    '7': 'correlations',
    '8': 'spectrogram',
    '9': 'causal',
    '0': 'drift',
};

export function initGlobalShortcuts(
    deps: GlobalShortcutsDeps,
): void {
    if (shortcutsBound) return;
    shortcutsBound = true;

    const handler = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;

        const key = String(event.key || '').toLowerCase();
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
            if (key === 'k') {
                event.preventDefault();
                void deps.openCommands();
                return;
            }

            if (key === ',') {
                event.preventDefault();
                void deps.openSettings();
                return;
            }

            return;
        }

        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            const page = ALT_NAVIGATION[key];
            if (page) {
                event.preventDefault();
                deps.showPage(page);
            }
        }
    };

    window.addEventListener('keydown', handler);
    deps.registerCleanup(() => {
        window.removeEventListener('keydown', handler);
        shortcutsBound = false;
    });
}
