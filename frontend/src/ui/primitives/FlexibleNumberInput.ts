// Flexible number input
//
// Native `<input type="number" min=".." max="..">` rejects values outside the
// range while the user is still typing (e.g. you can't type "15" into a
// `max="10"` field because the value is invalid as soon as the second digit
// lands). For our toolbars we want a more forgiving experience:
//
//   • The user can type, paste, or arrow-step any value, regardless of
//     min/max.
//   • On commit (change / blur), the value is clamped back into range and a
//     soft warning class is applied so the UI can indicate the adjustment.
//   • If the field has no value (empty), commit leaves it empty so the
//     caller can decide what default to apply.
//
// Usage:
//   const controller = setupFlexibleNumberInput(input);
//   controller.destroy();

export interface FlexibleNumberInputOptions {
    /**
     * Called whenever the input commits a new (possibly clamped) value.
     * Receives `null` for empty values.
     */
    onCommit?: (value: number | null, original: number | null, clamped: boolean) => void;
}

export interface FlexibleNumberInputController {
    input: HTMLInputElement;
    destroy(): void;
}

const FLEXIBLE_SELECTOR = 'input.flexible-number, input.modal-input[type="number"], input[type="number"].ctrl-sm';
const WARNING_CLASS = 'is-clamped';

function readNumericBounds(input: HTMLInputElement): { min: number | null; max: number | null; step: number | null } {
    // Read bounds from the preserved dataset (set when the input was upgraded
    // and its native min/max attributes were stripped) and fall back to live
    // attributes for inputs that haven't been upgraded yet.
    const minRaw = input.dataset.flexMin ?? (input.min !== '' ? input.min : '');
    const maxRaw = input.dataset.flexMax ?? (input.max !== '' ? input.max : '');
    const stepRaw = input.dataset.flexStep ?? (input.step !== '' ? input.step : '');
    const min = minRaw !== '' ? Number(minRaw) : null;
    const max = maxRaw !== '' ? Number(maxRaw) : null;
    const step = stepRaw !== '' && stepRaw !== 'any' ? Number(stepRaw) : null;
    return {
        min: Number.isFinite(min as number) ? min : null,
        max: Number.isFinite(max as number) ? max : null,
        step: Number.isFinite(step as number) ? step : null,
    };
}

function clampValue(value: number, min: number | null, max: number | null): { value: number; clamped: boolean } {
    let next = value;
    let clamped = false;
    if (min !== null && Number.isFinite(min) && next < min) {
        next = min;
        clamped = true;
    }
    if (max !== null && Number.isFinite(max) && next > max) {
        next = max;
        clamped = true;
    }
    return { value: next, clamped };
}

function formatValue(value: number, step: number | null): string {
    if (!Number.isFinite(value)) return '';
    if (step !== null && Number.isFinite(step) && step > 0) {
        // Match the precision implied by the step (e.g. step=0.01 → 2 decimals).
        const decimals = step >= 1 ? 0 : Math.min(6, Math.max(0, -Math.floor(Math.log10(step))));
        return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
    }
    return String(value);
}

function describeBounds(input: HTMLInputElement): string {
    const { min, max } = readNumericBounds(input);
    if (min !== null && max !== null) return `Allowed range: ${min}–${max}`;
    if (min !== null) return `Minimum: ${min}`;
    if (max !== null) return `Maximum: ${max}`;
    return '';
}

export function setupFlexibleNumberInput(
    input: HTMLInputElement,
    options: FlexibleNumberInputOptions = {},
): FlexibleNumberInputController {
    // Strip the native min/max so the browser doesn't block keystrokes.
    // We retain them as data attributes so the clamp logic still knows the
    // original intent and so dev tools / tests can recover them.
    if (input.hasAttribute('min')) {
        input.dataset.flexMin = input.getAttribute('min') ?? '';
        input.removeAttribute('min');
    }
    if (input.hasAttribute('max')) {
        input.dataset.flexMax = input.getAttribute('max') ?? '';
        input.removeAttribute('max');
    }
    if (input.hasAttribute('step')) {
        input.dataset.flexStep = input.getAttribute('step') ?? '';
    }
    // Make sure these always exist so readNumericBounds can fall back cleanly.
    if (input.dataset.flexMin === undefined) input.dataset.flexMin = '';
    if (input.dataset.flexMax === undefined) input.dataset.flexMax = '';
    if (input.dataset.flexStep === undefined) input.dataset.flexStep = '';
    input.classList.add('flexible-number');
    input.setAttribute('inputmode', input.getAttribute('inputmode') || 'decimal');
    input.setAttribute('autocomplete', 'off');

    const hint = describeBounds(input);
    if (hint && !input.hasAttribute('title')) {
        input.setAttribute('title', hint);
    }

    const handleCommit = () => {
        const raw = input.value.trim();
        if (raw === '') {
            input.classList.remove(WARNING_CLASS);
            options.onCommit?.(null, null, false);
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            input.classList.add(WARNING_CLASS);
            options.onCommit?.(null, parsed, false);
            return;
        }
        const { min, max, step } = readNumericBounds(input);
        const { value: clampedValue, clamped } = clampValue(parsed, min, max);
        const formatted = formatValue(clampedValue, step);
        if (formatted !== input.value) {
            input.value = formatted;
        }
        input.classList.toggle(WARNING_CLASS, clamped);
        options.onCommit?.(clampedValue, parsed, clamped);
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleCommit();
        } else if (event.key === 'Escape') {
            input.classList.remove(WARNING_CLASS);
        }
    };

    const handleBlur = () => handleCommit();
    const handleInput = () => {
        // Clear the warning as soon as the user edits — they'll re-trigger
        // commit when they leave the field.
        if (input.classList.contains(WARNING_CLASS)) {
            input.classList.remove(WARNING_CLASS);
        }
    };

    input.addEventListener('keydown', handleKeydown);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('input', handleInput);

    return {
        input,
        destroy: () => {
            input.removeEventListener('keydown', handleKeydown);
            input.removeEventListener('blur', handleBlur);
            input.removeEventListener('input', handleInput);
            // Restore the original attributes so the input is back to its
            // declarative form if the upgrade is rolled back.
            if (input.dataset.flexMin !== undefined) {
                input.setAttribute('min', input.dataset.flexMin);
                delete input.dataset.flexMin;
            }
            if (input.dataset.flexMax !== undefined) {
                input.setAttribute('max', input.dataset.flexMax);
                delete input.dataset.flexMax;
            }
            input.classList.remove('flexible-number', WARNING_CLASS);
        },
    };
}

export function upgradeFlexibleNumberInputs(
    root: ParentNode = document,
    options: FlexibleNumberInputOptions = {},
): FlexibleNumberInputController[] {
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>(FLEXIBLE_SELECTOR))
        .filter((input) => !input.dataset.flexibleReady);
    return inputs.map((input) => {
        input.dataset.flexibleReady = 'true';
        return setupFlexibleNumberInput(input, options);
    });
}