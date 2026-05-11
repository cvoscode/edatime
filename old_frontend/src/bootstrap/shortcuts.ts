/**
 * Keyboard shortcut binding.
 *
 * Extracted from bootstrap/appShell.ts to reduce its scope.
 */

import type { CommandDefinition } from './commands.js';

export type { CommandDefinition };

export interface ShortcutDefinition {
    key: string;
    alt?: boolean;
    shift?: boolean;
    page?: string;
    action: () => void;
}

export interface ShortcutDeps {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    registerCleanup: (cleanup: () => void) => void;
}

const KEYBOARD_ONLY_SHORTCUTS: ReadonlyArray<ShortcutDefinition> = [
    { key: 'e', shift: true, action: () => triggerActivePageCsvExport() },
];

function triggerActivePageCsvExport(): void {
    if (currentPageName() === 'scatter') {
        document.getElementById('scatter-export-csv-btn')?.click?.();
        return;
    }
    (window as any).__edatime?.exportChartFilteredData?.('csv');
}

function isTypingTarget(target: EventTarget | null): boolean {
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement | null)?.dataset?.pageName || 'upload';
}

function matchesKeyboardShortcut(
    shortcut: Pick<ShortcutDefinition, 'key' | 'alt' | 'shift' | 'page'>,
    key: string,
    pageName: string,
    options: Pick<ShortcutDefinition, 'alt' | 'shift'>,
): boolean {
    return shortcut.key.toLowerCase() === key.toLowerCase()
        && Boolean(shortcut.alt) === Boolean(options.alt)
        && Boolean(shortcut.shift) === Boolean(options.shift)
}

export function findMatchingShortcut(
    key: string,
    pageName: string,
    options: Pick<ShortcutDefinition, 'alt' | 'shift'>,
    commandDefs: ReadonlyArray<CommandDefinition>,
    deps: ShortcutDeps,
): ShortcutDefinition | undefined {
    const commandShortcut = commandDefs.find((definition) => {
        const keyboard = definition.keyboard;
        return keyboard && matchesKeyboardShortcut(keyboard, key, pageName, options);
    });
    if (commandShortcut) {
        const keyboard = commandShortcut.keyboard!;
        return {
            key: keyboard.key,
            alt: keyboard.alt,
            shift: keyboard.shift,
            page: keyboard.page,
            action: () => commandShortcut.action(deps),
        };
    }
    return KEYBOARD_ONLY_SHORTCUTS.find((shortcut) => matchesKeyboardShortcut(shortcut, key, pageName, options));
}

let _bound = false;

export function initKeyboardShortcuts(
    deps: ShortcutDeps,
    commandDefs: ReadonlyArray<CommandDefinition>,
): void {
    if (_bound) return;
    _bound = true;
    (window as any).__edatime = (window as any).__edatime || {};

    const onKeydown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;
        const key = String(event.key || '').toLowerCase();
        const pageName = currentPageName();

        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            const shortcut = findMatchingShortcut(key, pageName, { alt: true, shift: false }, commandDefs, deps);
            if (shortcut) {
                event.preventDefault();
                shortcut.action();
                return;
            }
        }

        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const shortcut = findMatchingShortcut(key, pageName, { alt: false, shift: true }, commandDefs, deps);
        if (shortcut) {
            event.preventDefault();
            shortcut.action();
        }
    };

    window.addEventListener('keydown', onKeydown);
    deps.registerCleanup(() => window.removeEventListener('keydown', onKeydown));
    (window as any).__edatime.keyboardShortcutsBound = true;
}

export function __resetKeyboardShortcutsForTest(): void {
    _bound = false;
}
