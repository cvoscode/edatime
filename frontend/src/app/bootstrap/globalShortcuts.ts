/**
 * globalShortcuts — global keyboard shortcuts that are always active.
 *
 * Extracted from app.ts to keep the orchestrator slim.
 * Page-specific shortcuts (e.g. timeseries Shift+R/Z/C) remain in app.ts
 * since they depend on timeseries-specific deps.
 */

import type { CommandDefinition } from '../../bootstrap/commands.js';

export interface GlobalShortcutsDeps {
    showPage: (page: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    registerCleanup: (cleanup: () => void) => void;
    chartExportPng: () => void;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement | null)?.dataset?.pageName || 'upload';
}

function matchesShortcut(
    key: string,
    options: { alt?: boolean; shift?: boolean },
    def: { key: string; alt?: boolean; shift?: boolean; page?: string },
    pageName: string,
): boolean {
    return def.key.toLowerCase() === key.toLowerCase()
        && Boolean(def.alt) === Boolean(options.alt)
        && Boolean(def.shift) === Boolean(options.shift)
        && (!def.page || def.page === pageName);
}

export function initGlobalShortcuts(
    deps: GlobalShortcutsDeps,
    commandDefs: ReadonlyArray<CommandDefinition>,
): void {
    const win = window as Window & typeof globalThis;
    if (win.__edatime?.globalShortcutsBound) return;
    if (!win.__edatime) win.__edatime = {};

    const handler = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;
        if (event.ctrlKey || event.metaKey) return; // don't interfere with browser shortcuts

        const key = String(event.key || '').toLowerCase();
        const pageName = currentPageName();

        // Alt+[0-9] navigation shortcuts from command definitions
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            const match = commandDefs.find((def) =>
                def.keyboard
                && matchesShortcut(key, { alt: true, shift: false }, def.keyboard, pageName)
            );
            if (match) { event.preventDefault(); match.action(deps as any); return; }
        }

        // Shift-only shortcuts (timeseries page)
        if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const match = commandDefs.find((def) =>
                def.keyboard
                && matchesShortcut(key, { alt: false, shift: true }, def.keyboard, pageName)
            );
            if (match) { event.preventDefault(); match.action(deps as any); return; }
        }
    };

    window.addEventListener('keydown', handler);
    deps.registerCleanup(() => window.removeEventListener('keydown', handler));
    (win).__edatime.globalShortcutsBound = true;
}