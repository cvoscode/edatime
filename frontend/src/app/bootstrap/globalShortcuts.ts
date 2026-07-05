/**
 * globalShortcuts — global keyboard shortcuts that are always active.
 *
 * Extracted from app.ts to keep the orchestrator slim.
 * Page-specific shortcuts (e.g. timeseries Shift+R/Z/C) remain in app.ts
 * since they depend on timeseries-specific deps.
 */

export interface GlobalShortcutsDeps {
    showPage: (page: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/**
 * Wait for a property to appear on `window.__edatime` before returning.
 * `initGlobalShortcuts` is normally bound right after `initAppShell`,
 * but tests and other consumers may rebind the shell after shortcuts.
 * We yield a few times (max ~250ms) before giving up.
 */
async function waitForEdatimeKey<K extends string>(
    key: K,
    options: { timeoutMs?: number } = {},
): Promise<void> {
    const win = window as Window & typeof globalThis & { __edatime?: Record<string, unknown> };
    const timeoutMs = options.timeoutMs ?? 250;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (win.__edatime && key in win.__edatime) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

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
    const win = window as Window & typeof globalThis & {
        __edatime?: {
            globalShortcutsBound?: boolean;
            ensureSubsystem?: (name: string) => Promise<void>;
            openPalette?: () => void;
            openSettingsModal?: () => void;
        };
    };
    if (win.__edatime?.globalShortcutsBound) return;
    if (!win.__edatime) win.__edatime = {};
    // Note: ensureSubsystem may not be wired yet if initGlobalShortcuts
    // runs before initAppShell. The handler itself guards against that
    // case below by yielding once before invoking the deferred helper,
    // so the listener is safe to register immediately.

    const handler = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;

        const key = String(event.key || '').toLowerCase();
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
            if (key === 'k') {
                event.preventDefault();
                void (async () => {
                    await waitForEdatimeKey('ensureSubsystem');
                    await win.__edatime?.ensureSubsystem?.('commands');
                    win.__edatime?.openPalette?.();
                })();
                return;
            }

            if (key === ',') {
                event.preventDefault();
                void (async () => {
                    await waitForEdatimeKey('ensureSubsystem');
                    await win.__edatime?.ensureSubsystem?.('settings');
                    win.__edatime?.openSettingsModal?.();
                })();
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
    deps.registerCleanup(() => window.removeEventListener('keydown', handler));
    (win).__edatime.globalShortcutsBound = true;
}
