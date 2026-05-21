/**
 * RangeSlider — headless range input with optional label and formatted value display.
 *
 * State: localValue is a local signal (ephemeral, not persisted).
 * For controlled usage, pass value + onInput to sync with parent state.
 *
 * @example
 * <RangeSlider
 *   label="Threshold"
 *   min={0}
 *   max={100}
 *   value={threshold()}
 *   onInput={e => setThreshold(parseFloat(e.currentTarget.value))}
 *   showValue
 *   formatValue={v => `${v}%`}
 * />
 */
import { Component, JSX, splitProps, createSignal } from 'solid-js';
import styles from './RangeSlider.module.css';

export interface RangeSliderProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: string;
    showValue?: boolean;
    formatValue?: (value: number) => string;
    class?: string;
}

export const RangeSlider: Component<RangeSliderProps> = (props) => {
    const [local, rest] = splitProps(props, ['label', 'showValue', 'formatValue', 'class']);

    // Local value — initialized from props.value but kept in sync via onInput
    const [localValue, setLocalValue] = createSignal(
        typeof (rest as any).value === 'number' ? (rest as any).value : 0
    );

    const displayValue = () => {
        if (local.formatValue) return local.formatValue(localValue());
        return localValue().toString();
    };

    return (
        <div class={`${styles.wrapper} ${local.class ?? ''}`}>
            {local.label && <span class={styles.label}>{local.label}</span>}
            <input
                type="range"
                class={styles.slider}
                value={localValue()}
                onInput={(e) => {
                    const v = parseFloat(e.currentTarget.value);
                    setLocalValue(v);
                    // Also call parent's onInput if provided (controlled mode)
                    if (typeof (rest as any).onInput === 'function') {
                        (rest as any).onInput(e);
                    }
                }}
                {...rest}
            />
            {local.showValue && <span class={styles.value}>{displayValue()}</span>}
        </div>
    );
};

export default RangeSlider;