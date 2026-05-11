import { Component, JSX, splitProps, createSignal } from 'solid-js';
import styles from './RangeSlider.module.css';

interface RangeSliderProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

const RangeSlider: Component<RangeSliderProps> = (props) => {
  const [local, rest] = splitProps(props, ['label', 'showValue', 'formatValue', 'class']);
  const [localValue, setLocalValue] = createSignal((rest as any).value ?? 0);

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
        onInput={(e) => setLocalValue(parseFloat(e.currentTarget.value))}
        {...rest}
      />
      {local.showValue && <span class={styles.value}>{displayValue()}</span>}
    </div>
  );
};

export default RangeSlider;