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
        if (modal) modal.hidden = false;
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        trapBackgroundInteraction();
        opts.onOpen?.();
        focusInitialElement();
        document.addEventListener('keydown', handleKeydown);
    };

    const close = () => {
        if (modal) modal.hidden = true;
        document.removeEventListener('keydown', handleKeydown);
        restoreBlockedShell();
        opts.onClose?.();
        lastFocusedElement?.focus();
        lastFocusedElement = null;
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
