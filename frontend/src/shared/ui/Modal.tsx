/**
 * Modal — headless modal dialog with Portal, keyboard dismissal, and overlay click handling.
 *
 * Renders via Portal when open. Traps focus via Escape key. Calls onClose when:
 * - Escape key is pressed
 * - Overlay (backdrop) is clicked
 * Does NOT call onClose when clicking the modal panel itself (stopPropagation).
 *
 * @example
 * <Modal
 *   open={isOpen()}
 *   onClose={() => setIsOpen(false)}
 *   title="Filter Columns"
 *   footer={<Button onClick={() => setIsOpen(false)}>Apply</Button>}
 * >
 *   {children}
 * </Modal>
 */
import { Component, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './Modal.module.css';

export interface ModalProps {
    /** Controlled open state */
    open: boolean;
    /** Called when user dismisses (Escape or backdrop click) */
    onClose: () => void;
    /** Optional title rendered in header */
    title?: string;
    /** Modal body content */
    children?: any;
    /** Optional footer content (e.g., action buttons) */
    footer?: any;
    /** Additional CSS class for the modal panel */
    class?: string;
}

export const Modal: Component<ModalProps> = (props) => {
    // Wire keyboard listener only while open
    createEffect(() => {
        if (!props.open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                props.onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    });

    return (
        <Show when={props.open}>
            <Portal>
                {/* Overlay — click to dismiss */}
                <div class={styles.overlay} onClick={props.onClose}>
                    {/* Panel — stopPropagation to prevent close on panel click */}
                    <div
                        class={`${styles.modal} ${props.class ?? ''}`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={props.title ? 'modal-title' : undefined}
                    >
                        <Show when={props.title}>
                            <div class={styles.header}>
                                <h2 id="modal-title" class={styles.title}>{props.title}</h2>
                                <button
                                    class={styles.closeBtn}
                                    onClick={props.onClose}
                                    aria-label="Close modal"
                                    type="button"
                                >
                                    ×
                                </button>
                            </div>
                        </Show>
                        <div class={styles.body}>{props.children}</div>
                        <Show when={props.footer}>
                            <div class={styles.footer}>{props.footer}</div>
                        </Show>
                    </div>
                </div>
            </Portal>
        </Show>
    );
};

export default Modal;