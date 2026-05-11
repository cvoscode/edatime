import { Component, JSX, splitProps } from 'solid-js';
import styles from './Input.module.css';

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ['label', 'error', 'class']);

  return (
    <div class={`${styles.wrapper} ${local.class ?? ''}`}>
      {local.label && <label class={styles.label}>{local.label}</label>}
      <input
        class={`${styles.input} ${local.error ? styles.hasError : ''}`}
        {...rest}
      />
      {local.error && <span class={styles.error}>{local.error}</span>}
    </div>
  );
};

export default Input;