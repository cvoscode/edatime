import { Component, JSX } from 'solid-js';
import styles from './Badge.module.css';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: JSX.Element;
  class?: string;
}

const Badge: Component<BadgeProps> = (props) => {
  const variant = () => props.variant ?? 'neutral';

  return (
    <span class={`${styles.badge} ${styles[variant()]} ${props.class ?? ''}`}>
      {props.children}
    </span>
  );
};

export default Badge;