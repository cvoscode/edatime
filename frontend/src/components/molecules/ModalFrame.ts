export interface ModalFrameProps {
    title: string;
    id?: string;
    onClose?: () => void;
}

export function ModalFrame(props: ModalFrameProps): HTMLDivElement {
    const modal = document.createElement('div');
    if (props.id) modal.id = props.id;
    modal.className = 'modal-frame';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = props.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => props.onClose?.());
    header.append(title, close);

    const body = document.createElement('div');
    body.className = 'modal-frame__body';
    modal.append(header, body);
    return modal;
}
