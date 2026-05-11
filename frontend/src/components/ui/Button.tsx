import { Component, JSX, splitProps } from 'solid-js';
import styles from './Button.module.css';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'children']);

  const variant = () => local.variant ?? 'primary';
  const size = () => local.size ?? 'md';

  return (
    <button
      class={`${styles.button} ${styles[variant()]} ${styles[size()]} ${local.class ?? ''}`}
      {...rest}
    >
      {local.children}
    </button>
  );
};

export default Button;