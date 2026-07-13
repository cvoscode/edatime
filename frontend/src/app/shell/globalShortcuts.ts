/**
 * globalShortcuts — global keyboard shortcuts that are always active.
 *
 * Owned by the shell because navigation, commands, and settings are
 * application-wide shell actions.
 */

export interface GlobalShortcutsDeps {
    showPage: (page: string) => void;
    openCommands: () => Promise<void>;
    openSettings: () => Promise<void>;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
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

export interface GlobalShortcutsController {
    mount(deps: GlobalShortcutsDeps): () => void;
}

/** Creates the global-shortcut owner for one application shell instance. */
export function createGlobalShortcuts(): GlobalShortcutsController {
    let disposeBinding: (() => void) | null = null;

    return {
        mount(deps) {
            if (disposeBinding) return disposeBinding;

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
            disposeBinding = () => {
                if (!disposeBinding) return;
                window.removeEventListener('keydown', handler);
                disposeBinding = null;
            };
            return disposeBinding;
        },
    };
}
