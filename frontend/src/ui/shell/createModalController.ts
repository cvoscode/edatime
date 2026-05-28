/**
 * Shared modal controller factory.
 * Binds close buttons, backdrop click, and manages modal visibility.
 */
export function createModalController(opts: {
    modalId: string;
    closeButtonIds: string[];
    onOpen?: () => void;
    onClose?: () => void;
}) {
    const modal = document.getElementById(opts.modalId) as HTMLElement | null;

    const open = () => {
        if (modal) modal.hidden = false;
        opts.onOpen?.();
    };

    const close = () => {
        if (modal) modal.hidden = true;
        opts.onClose?.();
    };

    // Bind close buttons
    for (const id of opts.closeButtonIds) {
        document.getElementById(id)?.addEventListener('click', close);
    }

    // Backdrop click to close
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });

    return { open, close };
}
