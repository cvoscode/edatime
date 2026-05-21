/**
 * Skeleton — headless placeholder element for loading states.
 *
 * Renders a non-interactive rectangle/circle/text shape as a loading placeholder.
 * No internal state — purely presentational.
 *
 * @example
 * <Skeleton width={200} height={16} variant="text" />
 * <Skeleton width={60} height={60} variant="circle" />
 * <Skeleton width="100%" height={200} variant="rect" />
 */
import { Component, JSX } from 'solid-js';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    variant?: 'text' | 'rect' | 'circle';
    class?: string;
}

export const Skeleton: Component<SkeletonProps> = (props) => {
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