/**
 * Shared drawer controller factory.
 * Manages open/close state, body class, and persistent visibility state.
 */
export function createDrawerController(opts: {
    drawerId: string;
    toggleButtonIds: string[];
    onOpen?: () => void;
    onClose?: () => void;
}) {
    const drawer = document.getElementById(opts.drawerId) as HTMLElement | null;
    let _isOpen = false;

    const isOpen = () => _isOpen;

    const open = () => {
        if (drawer) drawer.hidden = false;
        document.body.classList.add('drawer-open');
        _isOpen = true;
        opts.onOpen?.();
    };

    const close = () => {
        if (drawer) drawer.hidden = true;
        document.body.classList.remove('drawer-open');
        _isOpen = false;
        opts.onClose?.();
    };

    const toggle = () => {
        if (_isOpen) close();
        else open();
    };

    // Bind toggle buttons
    const toggleButtons = opts.toggleButtonIds
        .map((id) => document.getElementById(id))
        .filter((button): button is HTMLElement => !!button);
    for (const button of toggleButtons) button.addEventListener('click', toggle);

    // Backdrop click to close
    const onBackdropClick = (event: Event) => {
        if (event.target === drawer) close();
    };
    drawer?.addEventListener('click', onBackdropClick);

    // Escape key to close
    const onKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && _isOpen) close();
    };
    document.addEventListener('keydown', onKeydown);

    const dispose = () => {
        close();
        for (const button of toggleButtons) button.removeEventListener('click', toggle);
        drawer?.removeEventListener('click', onBackdropClick);
        document.removeEventListener('keydown', onKeydown);
    };

    return { open, close, toggle, isOpen, dispose };
}
