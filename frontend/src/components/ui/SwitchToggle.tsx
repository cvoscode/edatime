import { Component, JSX, splitProps } from 'solid-js';
import styles from './SwitchToggle.module.css';

interface SwitchToggleProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

const SwitchToggle: Component<SwitchToggleProps> = (props) => {
  const [local, rest] = splitProps(props, ['label', 'class']);

  return (
    <label class={`${styles.wrapper} ${local.class ?? ''}`}>
      <input type="checkbox" class={styles.input} {...rest} />
      <span class={styles.track}>
        <span class={styles.thumb} />
      </span>
      {local.label && <span class={styles.label}>{local.label}</span>}
    </label>
  );
};

export default SwitchToggle;