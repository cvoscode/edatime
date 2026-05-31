/**
 * Shared SeriesChip list orchestration.
 *
 * Owns: rendering a list of chips into a container, keyboard activation
 * (Enter/Space → toggle checkbox), post-creation class/attribute wiring,
 * and color update plumbing. Does NOT own data fetching or domain logic.
 */

import { SeriesChip } from './composites/SeriesChip.js';

export interface SeriesChipListItem {
    column: string;
    label?: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    title?: string;
    onToggle: (checked: boolean, column: string) => void;
    onColorInput?: (color: string, column: string) => void;
    onMenuClick?: (column: string) => void;
    menuLabel?: string;
}

export interface SeriesChipListOptions {
    /** Container element to render chips into. */
    container: HTMLElement;
    /** Chip items to render. */
    items: SeriesChipListItem[];
    /**
     * Optional CSS class added to every chip after creation (e.g.
     * 'fft-trace-chip' or 'timeseries-chip'). Use this for post-creation
     * mutations that are easier to express declaratively.
     */
    chipClass?: string;
    /**
     * Extra callback fired after a chip's color is updated via its ColorInput.
     * The chip's own `props.onColorInput` is still called; this fires in addition.
     * Useful when the caller needs to persist the color somewhere (e.g. a module-level map).
     */
    onColorUpdate?: (column: string, color: string) => void;
    /**
     * Additional static attributes applied to every chip element after creation.
     * E.g. { role: 'button', tabIndex: '0' } makes chips keyboard-accessible.
     */
    postChipAttributes?: Record<string, string>;
    /**
     * Additional CSS class applied to each chip after creation, conditional on
     * the item. Return '' for chips that should not receive the class.
     * E.g. (item) => item.column.startsWith('meta_') ? 'meta-chip' : ''
     */
    postChipClass?: (item: SeriesChipListItem) => string;
    /**
     * When true, `renderSeriesChipList` preserves any existing chip elements
     * that match a rendered `data-col` even when the render would normally clear
     * and rebuild them. This is useful when callers need to preserve transient
     * DOM state (e.g. loading classes) across render cycles without having to
     * manually capture and restore those elements.
     *
     * Implementation note: existing elements with matching columns are updated
     * in-place using the update path, so any post-creation extras
     * (`postChipAttributes`, `postChipClass`, `chipClass`) are NOT re-applied
     * to preserved chips — only their checked state and color are synced.
     *
     * Default: false (full clear-and-rebuild, matching the historical behavior).
     */
    preserveExisting?: boolean;
}

/** Extra attributes/class applied to each chip after creation. */
interface ChipExtras {
    postChipAttributes?: Record<string, string>;
    postChipClass?: (item: SeriesChipListItem) => string;
}

/** Shared chip post-creation step: applies attributes + conditional class. */
function applyChipExtras(chip: HTMLElement, item: SeriesChipListItem, extras: ChipExtras): void {
    if (extras.postChipAttributes) {
        for (const [attr, val] of Object.entries(extras.postChipAttributes)) {
            chip.setAttribute(attr, val);
        }
    }
    if (extras.postChipClass) {
        const cls = extras.postChipClass(item);
        if (cls) chip.classList.add(cls);
    }
}

/**
 * Renders a list of `SeriesChip` items into `container`, replacing any existing
 * chips. Adds `chipClass` to each chip after creation and wires the delegated
 * keyboard handler.
 *
 * When `preserveExisting` is true, existing chip elements with matching columns
 * are preserved and updated in-place rather than replaced, which avoids
 * destroying transient DOM state (e.g. loading indicators).
 */
export function renderSeriesChipList(options: SeriesChipListOptions): void {
    const { container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass, preserveExisting } = options;
    if (preserveExisting) {
        updateSeriesChipList({ container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass });
        return;
    }
    container.innerHTML = '';

    // Clean up any prior keyboard listener
    const prevCleanup = (container as any).__chipKeyboardCleanup;
    if (typeof prevCleanup === 'function') prevCleanup();
    const cleanup = bindSeriesChipKeyboard(container);
    (container as any).__chipKeyboardCleanup = cleanup;

    const fragment = document.createDocumentFragment();
    for (const item of items) {
        const chip = SeriesChip({
            column: item.column,
            label: item.label,
            checked: item.checked,
            color: item.color,
            disabled: item.disabled,
            adaptiveTarget: item.adaptiveTarget,
            title: item.title,
            onToggle: (checked) => item.onToggle(checked, item.column),
            onColorInput: (color) => {
                item.onColorInput?.(color, item.column);
                onColorUpdate?.(item.column, color);
            },
            onMenuClick: item.onMenuClick ? () => item.onMenuClick!(item.column) : undefined,
            menuLabel: item.menuLabel,
        });

        (chip as HTMLElement).classList.add(chipClass ?? '');
        applyChipExtras(chip as HTMLElement, item, { postChipAttributes, postChipClass });
        fragment.appendChild(chip);
    }

    container.appendChild(fragment);
}

/**
 * Updates only the checked/active state and color of existing chips in
 * `container` without rebuilding the DOM. Uses `data-col` to match chips
 * to items. Chips whose column no longer appears in `items` are removed.
 * New chips receive the same post-creation extras as `renderSeriesChipList`.
 */
export function updateSeriesChipList(options: SeriesChipListOptions): void {
    const { container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass } = options;

    // Build a map of existing chip elements by column
    const existing = new Map<string, HTMLElement>();
    for (const el of container.querySelectorAll<HTMLElement>('[data-col]')) {
        const col = el.dataset.col;
        if (col !== undefined) existing.set(col, el);
    }

    // Determine which columns should remain
    const newCols = new Set(items.map((i) => i.column));

    // Remove stale chips
    for (const [col, el] of existing.entries()) {
        if (!newCols.has(col)) el.remove();
    }

    // Upsert or update chips
    for (const item of items) {
        let chip = existing.get(item.column);

        if (!chip) {
            // Create new chip
            chip = SeriesChip({
                column: item.column,
                label: item.label,
                checked: item.checked,
                color: item.color,
                disabled: item.disabled,
                adaptiveTarget: item.adaptiveTarget,
                title: item.title,
                onToggle: (checked) => item.onToggle(checked, item.column),
                onColorInput: (color) => {
                    item.onColorInput?.(color, item.column);
                    onColorUpdate?.(item.column, color);
                },
                onMenuClick: item.onMenuClick ? () => item.onMenuClick!(item.column) : undefined,
                menuLabel: item.menuLabel,
            });

            (chip as HTMLElement).classList.add(chipClass ?? '');
            applyChipExtras(chip as HTMLElement, item, { postChipAttributes, postChipClass });
            container.appendChild(chip);
        } else {
            // Update existing chip state
            const checkbox = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
            if (checkbox) checkbox.checked = item.checked;
            chip.className = chip.className.replace(/\bactive\b/g, '').trim() +
                (item.checked ? ' active' : '');
            chip.style.setProperty('--chip-accent', item.color);
        }
    }
}

/**

/**
 * Attaches a delegated `keydown` listener to `container` so that any chip
 * inside it responds to Enter/Space by toggling its checkbox.
 * Returns a cleanup function that removes the listener.
 */
export function bindSeriesChipKeyboard(container: HTMLElement): () => void {
    const handler = (event: KeyboardEvent) => {
        const chip = (event.target as HTMLElement)?.closest?.('.series-chip');
        if (!chip) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const checkbox = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (!checkbox) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    };

    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
}