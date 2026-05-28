export interface RangeSliderProps {
    label: string;
    min: number;
    max: number;
    value: number;
    step?: number;
    onInput?: (value: number) => void;
}

export function RangeSlider(props: RangeSliderProps): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.setAttribute('aria-label', props.label);
    input.min = String(props.min);
    input.max = String(props.max);
    input.step = String(props.step ?? 1);
    input.value = String(props.value);
    input.addEventListener('input', () => props.onInput?.(Number(input.value)));
    return input;
}
