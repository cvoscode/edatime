import { Component, JSX } from 'solid-js';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'rect' | 'circle';
  class?: string;
}

const Skeleton: Component<SkeletonProps> = (props) => {
  const variant = () => props.variant ?? 'rect';

  const style = (): JSX.CSSProperties => ({
    '--skeleton-width': typeof props.width === 'number' ? `${props.width}px` : props.width ?? '100%',
    '--skeleton-height': typeof props.height === 'number' ? `${props.height}px` : props.height ?? '1em',
  });

  return (
    <div
      class={`${styles.skeleton} ${styles[variant()]} ${props.class ?? ''}`}
      style={style()}
      aria-hidden="true"
    />
  );
};

export default Skeleton;