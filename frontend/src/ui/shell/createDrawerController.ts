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
    for (const id of opts.toggleButtonIds) {
        document.getElementById(id)?.addEventListener('click', toggle);
    }

    // Backdrop click to close
    drawer?.addEventListener('click', (event) => {
        if (event.target === drawer) close();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _isOpen) close();
    });

    return { open, close, toggle, isOpen };
}
