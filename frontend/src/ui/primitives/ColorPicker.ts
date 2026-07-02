/**
 * ColorPicker — compact popover that exposes 8 dark-theme presets, a hex
 * input, and a hidden native picker fallback. The component mirrors the
 * `ColorInput` API (an HTML element is returned, `onInput` fires on every
 * change) so call sites like `SeriesChip` can swap their swatch button
 * for the picker without touching the rest of the chip construction.
 *
 * The popover is anchored next to the swatch button, closes on outside
 * click and on Escape, and stays open across preset / hex edits so the
 * user can iterate without reopening the menu. The native fallback is
 * reachable through the "More colors…" entry so keyboard / screen-reader
 * users still get the OS picker; the in-app popover is just the friendlier
 * happy-path UI for the dark theme.
 */

import { ColorInput } from './ColorInput.js';

export interface ColorPickerProps {
    /** Visible label surfaced in `aria-label` and the swatch title. */
    label: string;
    /** Current color in `#RRGGBB` form. */
    value: string;
    /** Optional id passed to the underlying native fallback input. */
    id?: string;
    /** Optional class applied to the swatch button. */
    className?: string;
    /** Fires on every preset click / hex edit / native picker change. */
    onInput?: (value: string, event: Event) => void;
}

export interface ColorPickerHandle {
    /** Container element holding the swatch button. */
    element: HTMLDivElement;
    /**
     * Push a new value into the picker without opening the popover.
     * Used by consumers that update the swatch via `setSeriesColor`
     * after the picker has mounted so the visual stays in sync.
     */
    updateValue: (next: string) => void;
}

const DARK_PRESETS: readonly string[] = [
    '#00A8FF', // accent
    '#20E2D7', // cyan
    '#00C896', // green
    '#FFC041', // amber
    '#FF6B6B', // red
    '#B388FF', // violet
    '#F06292', // pink
    '#FFFFFF', // white
];

function isValidHex(value: string): boolean {
    return /^#([0-9a-fA-F]{6})$/.test(value);
}

/**
 * Close the popover owned by the swatch's ownerDocument, if any. We key
 * off a data attribute rather than a single shared reference so multiple
 * pickers on the page do not interfere with each other.
 */
function closePopover(button: HTMLElement): void {
    const popover = button.ownerDocument?.querySelector<HTMLElement>(`.color-picker-popover[data-owner="${button.dataset.colorPickerId}"]`);
    if (popover) popover.remove();
    button.setAttribute('aria-expanded', 'false');
}

function positionPopover(button: HTMLElement, popover: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    const docEl = button.ownerDocument?.documentElement;
    if (!docEl) return;
    const scrollY = window.scrollY || docEl.scrollTop || 0;
    const scrollX = window.scrollX || docEl.scrollLeft || 0;
    popover.style.position = 'absolute';
    popover.style.top = `${rect.bottom + scrollY + 6}px`;
    popover.style.left = `${rect.left + scrollX}px`;
    // Flip up if there is no room below.
    const popoverRect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (popoverRect.bottom > viewportHeight - 12) {
        popover.style.top = `${rect.top + scrollY - popoverRect.height - 6}px`;
    }
}

export function ColorPicker(props: ColorPickerProps): ColorPickerHandle {
    const root = document.createElement('div');
    root.className = `color-picker${props.className ? ` ${props.className}` : ''}`;

    // Swatch button mirrors the native picker's click-to-open behaviour.
    // Every preset click funnels through `props.onInput` so consumers get
    // the same live-update path they had with the native input.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-picker__swatch';
    button.setAttribute('aria-label', props.label);
    button.title = props.label;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.style.setProperty('--color-picker-current', props.value);

    const swatchPreview = document.createElement('span');
    swatchPreview.className = 'color-picker__swatch-fill';
    swatchPreview.style.backgroundColor = props.value;
    button.appendChild(swatchPreview);

    const popoverId = `color-picker-popover-${Math.random().toString(36).slice(2, 9)}`;
    button.dataset.colorPickerId = popoverId;
    button.setAttribute('aria-controls', popoverId);

    const openPopover = () => {
        // Recreate the popover every time so any prior hex / native
        // fallback inputs are fresh — the popover is short-lived.
        closePopover(button);
        const popover = document.createElement('div');
        popover.id = popoverId;
        popover.className = 'color-picker-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', `${props.label} presets`);
        popover.dataset.owner = popoverId;

        const presetGrid = document.createElement('div');
        presetGrid.className = 'color-picker__presets';
        presetGrid.setAttribute('role', 'listbox');
        presetGrid.setAttribute('aria-label', 'Color presets');
        for (const preset of DARK_PRESETS) {
            const presetBtn = document.createElement('button');
            presetBtn.type = 'button';
            presetBtn.className = 'color-picker__preset';
            presetBtn.style.setProperty('--color-picker-current', preset);
            presetBtn.setAttribute('aria-label', `Use color ${preset}`);
            presetBtn.dataset.color = preset;
            if (preset.toLowerCase() === props.value.toLowerCase()) {
                presetBtn.classList.add('is-active');
                presetBtn.setAttribute('aria-pressed', 'true');
            }
            presetBtn.addEventListener('click', (event) => {
                presetBtn.dispatchEvent(makeSyntheticInputEvent(props.value));
                props.onInput?.(preset, event);
                swatchPreview.style.backgroundColor = preset;
                button.style.setProperty('--color-picker-current', preset);
            });
            const fill = document.createElement('span');
            fill.className = 'color-picker__preset-fill';
            fill.style.backgroundColor = preset;
            presetBtn.appendChild(fill);
            presetGrid.appendChild(presetBtn);
        }
        popover.appendChild(presetGrid);

        const hexRow = document.createElement('div');
        hexRow.className = 'color-picker__hex';
        const hexLabel = document.createElement('label');
        hexLabel.className = 'color-picker__hex-label';
        hexLabel.textContent = 'Hex';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.spellcheck = false;
        hexInput.maxLength = 7;
        hexInput.className = 'color-picker__hex-input';
        hexInput.value = props.value;
        hexInput.setAttribute('aria-label', `${props.label} hex value`);
        hexInput.addEventListener('input', () => {
            const candidate = hexInput.value.trim();
            if (!isValidHex(candidate)) return;
            swatchPreview.style.backgroundColor = candidate;
            button.style.setProperty('--color-picker-current', candidate);
            props.onInput?.(candidate, new Event('input'));
        });
        hexLabel.appendChild(hexInput);
        hexRow.appendChild(hexLabel);
        popover.appendChild(hexRow);

        // "More colors…" re-opens the native fallback so the OS picker
        // (with its accessibility tooling) is still reachable without
        // the default 2D palette being on the happy path.
        const nativeBtn = document.createElement('button');
        nativeBtn.type = 'button';
        nativeBtn.className = 'color-picker__native';
        nativeBtn.textContent = 'More colors…';
        nativeBtn.setAttribute('aria-label', `Open full color picker for ${props.label}`);
        const nativeFallback = ColorInput({
            id: props.id ? `${props.id}-native` : undefined,
            label: props.label,
            value: props.value,
            className: 'color-picker__native-input',
            onInput: (next, event) => {
                swatchPreview.style.backgroundColor = next;
                button.style.setProperty('--color-picker-current', next);
                hexInput.value = next;
                props.onInput?.(next, event);
            },
        });
        nativeFallback.style.display = 'none';
        nativeBtn.addEventListener('click', () => {
            nativeFallback.click();
        });
        const nativeWrap = document.createElement('div');
        nativeWrap.className = 'color-picker__native-wrap';
        nativeWrap.append(nativeBtn, nativeFallback);
        popover.appendChild(nativeWrap);

        button.ownerDocument?.body.appendChild(popover);
        // Measure after attach so the upward-flip fallback has accurate
        // dimensions when deciding whether to flip.
        positionPopover(button, popover);
        button.setAttribute('aria-expanded', 'true');
        hexInput.focus();
        hexInput.select();

        const onOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (popover.contains(target) || button.contains(target)) return;
            closePopover(button);
            document.removeEventListener('mousedown', onOutsideClick);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            closePopover(button);
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onOutsideClick);
        };
        document.addEventListener('mousedown', onOutsideClick);
        document.addEventListener('keydown', onKey);
    };

    button.addEventListener('click', () => {
        if (button.getAttribute('aria-expanded') === 'true') {
            closePopover(button);
            return;
        }
        openPopover();
    });

    // Live-update the swatch when the parent updates the value via
    // `setSeriesColor`. The component is unaware of the consumer's
    // state-management, so we expose a small API on the returned root.
    root.appendChild(button);
    return {
        element: root,
        updateValue: (next: string) => {
            if (!isValidHex(next)) return;
            swatchPreview.style.backgroundColor = next;
            button.style.setProperty('--color-picker-current', next);
            const popover = button.ownerDocument?.querySelector<HTMLElement>(`.color-picker-popover[data-owner="${popoverId}"]`);
            if (popover) {
                for (const btn of popover.querySelectorAll<HTMLButtonElement>('.color-picker__preset')) {
                    const isActive = btn.dataset.color?.toLowerCase() === next.toLowerCase();
                    btn.classList.toggle('is-active', isActive);
                    if (isActive) btn.setAttribute('aria-pressed', 'true');
                    else btn.removeAttribute('aria-pressed');
                }
                const hex = popover.querySelector<HTMLInputElement>('.color-picker__hex-input');
                if (hex) hex.value = next;
            }
        },
    };
}

// Marker so `props.onInput` consumers receive a familiar Event shape from
// the preset click path; the actual event object doesn't matter to them.
function makeSyntheticInputEvent(value: string): Event {
    const event = new Event('input', { bubbles: true });
    Object.defineProperty(event, 'target', { value: { value }, enumerable: true });
    return event;
}
