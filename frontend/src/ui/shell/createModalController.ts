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
    const dialog = modal?.querySelector<HTMLElement>('[role="dialog"]') ?? modal;
    const blockedSiblings: Array<{
        element: HTMLElement;
        ariaHidden: string | null;
        hadInert: boolean;
    }> = [];
    let previousOverflow = '';
    let lastFocusedElement: HTMLElement | null = null;
    let isOpen = false;

    const focusableSelector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const setElementInert = (element: HTMLElement, inert: boolean) => {
        if (inert) {
            element.setAttribute('inert', '');
            (element as HTMLElement & { inert?: boolean }).inert = true;
            return;
        }
        element.removeAttribute('inert');
        (element as HTMLElement & { inert?: boolean }).inert = false;
    };

    const getFocusableElements = (): HTMLElement[] => {
        if (!dialog) return [];
        return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
            .filter((element) => !element.hidden && element.tabIndex >= 0);
    };

    const focusInitialElement = () => {
        const [firstFocusable] = getFocusableElements();
        if (firstFocusable) {
            firstFocusable.focus();
            return;
        }
        if (dialog && dialog.tabIndex < 0) dialog.tabIndex = -1;
        dialog?.focus();
    };

    const restoreBlockedShell = () => {
        document.body.style.overflow = previousOverflow;
        while (blockedSiblings.length > 0) {
            const sibling = blockedSiblings.pop();
            if (!sibling) continue;
            if (sibling.ariaHidden === null) sibling.element.removeAttribute('aria-hidden');
            else sibling.element.setAttribute('aria-hidden', sibling.ariaHidden);
            setElementInert(sibling.element, sibling.hadInert);
        }
    };

    const trapBackgroundInteraction = () => {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (!modal) return;
        Array.from(document.body.children).forEach((child) => {
            if (!(child instanceof HTMLElement) || child === modal) return;
            blockedSiblings.push({
                element: child,
                ariaHidden: child.getAttribute('aria-hidden'),
                hadInert: child.hasAttribute('inert'),
            });
            child.setAttribute('aria-hidden', 'true');
            setElementInert(child, true);
        });
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (!modal || modal.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements();
        if (focusable.length === 0) {
            event.preventDefault();
            dialog?.focus();
            return;
        }

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        const activeInsideDialog = !!active && !!dialog?.contains(active);

        if (event.shiftKey) {
            if (!activeInsideDialog || active === first || active === dialog) {
                event.preventDefault();
                last.focus();
            }
            return;
        }

        if (!activeInsideDialog || active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const open = () => {
        if (isOpen) return;
        isOpen = true;
        if (modal) modal.hidden = false;
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        trapBackgroundInteraction();
        opts.onOpen?.();
        focusInitialElement();
        document.addEventListener('keydown', handleKeydown);
    };

    const close = () => {
        if (!isOpen) return;
        isOpen = false;
        if (modal) modal.hidden = true;
        document.removeEventListener('keydown', handleKeydown);
        restoreBlockedShell();
        opts.onClose?.();
        lastFocusedElement?.focus();
        lastFocusedElement = null;
    };

    // Bind close buttons
    const closeButtons = opts.closeButtonIds
        .map((id) => document.getElementById(id))
        .filter((button): button is HTMLElement => !!button);
    for (const button of closeButtons) button.addEventListener('click', close);

    // Backdrop click to close
    const onBackdropClick = (event: Event) => {
        if (event.target === modal) close();
    };
    modal?.addEventListener('click', onBackdropClick);

    const dispose = () => {
        close();
        for (const button of closeButtons) button.removeEventListener('click', close);
        modal?.removeEventListener('click', onBackdropClick);
        document.removeEventListener('keydown', handleKeydown);
    };

    return { open, close, dispose };
}
