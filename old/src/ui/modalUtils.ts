export function initModalClose(
    modalId: string,
    closeBtnId: string,
    cancelBtnId: string,
    onClose?: () => void,
): (() => void) | null {
    const modal = document.getElementById(modalId) as HTMLElement | null;
    if (!modal) return null;
    const close = () => {
        modal.hidden = true;
        onClose?.();
    };
    document.getElementById(closeBtnId)?.addEventListener('click', close);
    document.getElementById(cancelBtnId)?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });
    return close;
}