import { Button } from '../atoms/Button.js';
import { TextInput } from '../atoms/TextInput.js';
import { ModalFrame } from '../molecules/ModalFrame.js';

export interface ColumnFilterModalProps {
    column: string;
    from: string;
    to: string;
    onApply: (from: string, to: string) => void;
    onCancel?: () => void;
}

export function ColumnFilterModal(props: ColumnFilterModalProps): HTMLDivElement {
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
