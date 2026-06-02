import { Button } from '../primitives/Button.js';
import { TextInput } from '../primitives/TextInput.js';
import { ModalFrame } from './ModalFrame.js';

/** Bind interface: wire existing DOM elements in index.html instead of creating new ones.
 *  Used when the modal HTML is server-rendered with fixed IDs. */
export interface ColumnFilterModalBind {
    root: HTMLElement;
    applyBtn: HTMLButtonElement;
    cancelBtn: HTMLElement;
    closeBtn: HTMLElement;
    minInput: HTMLInputElement;
    maxInput: HTMLInputElement;
    minRangeInput: HTMLInputElement;
    maxRangeInput: HTMLInputElement;
}

export interface ColumnFilterModalProps {
    /** Bind mode: wire existing DOM elements (preserves existing IDs from index.html). */
    bind?: ColumnFilterModalBind;
    /** Create mode: create new DOM elements (existing behavior). */
    column?: string;
    from?: string;
    to?: string;
    onApply: (from: string, to: string) => void;
    onCancel?: () => void;
}

export function ColumnFilterModal(props: ColumnFilterModalProps): HTMLElement {
    if (props.bind) {
        return bindColumnFilterModal(props.bind, props);
    }
    return createColumnFilterModal(props);
}

function createColumnFilterModal(props: ColumnFilterModalProps): HTMLDivElement {
    const modal = ModalFrame({ title: `Filter ${props.column}`, onClose: props.onCancel });
    const body = modal.querySelector('.modal-frame__body') as HTMLDivElement;
    const from = TextInput({ label: `${props.column} minimum`, value: props.from });
    const to = TextInput({ label: `${props.column} maximum`, value: props.to });
    const apply = Button({
        label: 'Apply',
        className: 'primary',
        onClick: () => props.onApply(from.value, to.value),
    });
    const cancel = Button({ label: 'Cancel', onClick: () => props.onCancel?.() });
    body.append(from, to, apply, cancel);
    return modal;
}

function bindColumnFilterModal(b: ColumnFilterModalBind, props: ColumnFilterModalProps): HTMLElement {
    const { root, applyBtn, cancelBtn, closeBtn, minInput, maxInput } = b;

    applyBtn.addEventListener('click', () => {
        props.onApply(minInput.value, maxInput.value);
    });
    cancelBtn.addEventListener('click', () => props.onCancel?.());
    closeBtn.addEventListener('click', () => props.onCancel?.());
    root.addEventListener('click', (event) => {
        if (event.target === root) props.onCancel?.();
    });

    const escapeHandler = (e: KeyboardEvent) => {
        if (!root.hidden && e.key === 'Escape') props.onCancel?.();
    };
    document.addEventListener('keydown', escapeHandler);

    return root;
}