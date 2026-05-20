/**
 * Page keyboard shortcuts hook.
 * Consolidated keyboard event handling per page.
 */
import { onMount, onCleanup } from 'solid-js';

/**
 * Shortcut definition for a single key binding.
 */
export interface ShortcutDefinition {
    /** Single key or key combo (e.g., 'r', 'z', 'c', 'p', 'e'). Case-insensitive. */
    key: string;
    /** Called when shortcut is triggered */
    handler: (event: KeyboardEvent) => void;
    /** Require shift key. Default: false */
    requireShift?: boolean;
    /** Require ctrl/cmd key. Default: false */
    requireCtrl?: boolean;
    /** Require alt key. Default: false */
    requireAlt?: boolean;
    /** Description for documentation/tooltips */
    description?: string;
}

/**
 * Options for usePageShortcuts()
 */
export interface PageShortcutsOptions {
    /** List of shortcut handlers to register */
    shortcuts: ShortcutDefinition[];
    /** Event listener target. Default: window */
    target?: Window | typeof globalThis;
    /** Callback for any unhandled shortcut key */
    onUnknownKey?: (key: string, event: KeyboardEvent) => void;
}

/**
 * Registers keyboard shortcuts for a page.
 * Dispatches 'edatime:shortcut' custom events when Alt+key is pressed.
 * Also handles Shift-only shortcuts via custom event dispatching.
 * 
 * Usage:
 *   usePageShortcuts({
 *     shortcuts: [
 *       { key: 'r', handler: () => resetZoom(), description: 'Reset zoom' },
 *       { key: 'z', handler: () => zoomOut(), description: 'Zoom out' },
 *       { key: 'p', handler: () => exportPNG(), description: 'Export PNG' },
 *       { key: 'e', handler: () => exportCSV(), description: 'Export CSV' },
 *       { key: 'c', handler: () => clearFilters(), description: 'Clear filters' },
 *     ],
 *   });
 */
export function usePageShortcuts(options: PageShortcutsOptions) {
    const { shortcuts, target = window, onUnknownKey } = options;

    const isTypingTarget = (el: EventTarget | null): boolean => {
        if (!el) return false;
        const element = el as HTMLElement;
        const tag = element.tagName?.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
    };

    const handleKeydown = (event: KeyboardEvent) => {
        // Ignore if typing in an input
        if (isTypingTarget(event.target)) return;

        // Ignore if default already prevented
        if (event.defaultPrevented) return;

        const key = String(event.key || '').toLowerCase();

        // Alt+key: direct routing (preserved from App.tsx for backward compat)
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            // Page navigation via Alt+number - let App.tsx handle this
            return;
        }

        // Shift+key without other modifiers: dispatch custom events
        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            // Check if this is an unknown key we might want to report
            if (onUnknownKey && !shortcuts.find(s => s.key.toLowerCase() === key)) {
                onUnknownKey(key, event);
            }
            return;
        }

        // Shift+key handling for registered shortcuts
        const shortcut = shortcuts.find(s => s.key.toLowerCase() === key);
        if (!shortcut) {
            // Dispatch event anyway for legacy handlers
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('edatime:shortcut', { detail: { key } }));
            return;
        }

        // Validate modifier requirements
        if (shortcut.requireShift && !event.shiftKey) return;
        if (shortcut.requireCtrl && !event.ctrlKey && !event.metaKey) return;
        if (shortcut.requireAlt && !event.altKey) return;

        event.preventDefault();
        try {
            shortcut.handler(event);
        } catch (e) {
            console.error('[usePageShortcuts] handler error:', e);
        }
    };

    onMount(() => {
        target.addEventListener('keydown', handleKeydown);
    });

    onCleanup(() => {
        target.removeEventListener('keydown', handleKeydown);
    });
}

/**
 * Creates a simple toggle handler for keyboard-modifier combos.
 * Useful for modal/drawer open/close.
 */
export function createKeyboardToggle(
    setOpen: (open: boolean) => void
) {
    return {
        toggle: () => setOpen(true),
        close: () => setOpen(false),
    };
}