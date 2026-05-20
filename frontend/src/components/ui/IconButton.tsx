import { Component, JSX, splitProps } from 'solid-js';
import Tooltip from './Tooltip';
import styles from './IconButton.module.css';

interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: JSX.Element;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

const IconButton: Component<IconButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['icon', 'size', 'variant', 'tooltip', 'tooltipPosition', 'class']);

  const size = () => local.size ?? 'md';
  const variant = () => local.variant ?? 'ghost';

  const button = (
    <button
      class={`${styles.iconButton} ${styles[size()]} ${styles[variant()]} ${local.class ?? ''}`}
      {...rest}
    >
      {local.icon}
    </button>
  );

  if (local.tooltip) {
    return (
      <Tooltip content={local.tooltip} position={local.tooltipPosition ?? 'top'}>
        {button}
      </Tooltip>
    );
  }

  return button;
};

export default IconButton;