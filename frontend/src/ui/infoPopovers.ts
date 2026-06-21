interface BindInfoPopoversOptions {
    selector?: string;
    attribute?: string;
    popoverClass?: string;
}

let activePopover: HTMLElement | null = null;

function hideInfoPopover(): void {
    activePopover?.remove();
    activePopover = null;
}

export function bindInfoPopovers(options: BindInfoPopoversOptions = {}): void {
    const {
        selector = '.toolbar-info-icon',
        attribute = 'data-info-tip',
        popoverClass = 'toolbar-info-popover',
    } = options;

    document.querySelectorAll<HTMLElement>(selector).forEach((icon) => {
        if (icon.dataset.infoPopoverBound === 'true') return;
        icon.dataset.infoPopoverBound = 'true';

        const readTipText = (): string => (icon.getAttribute(attribute) || '').replace(/\\n/g, '\n').trim();
        const show = (anchorX: number, anchorY: number) => {
            const tipText = readTipText();
            hideInfoPopover();
            if (!tipText) return;

            const popover = document.createElement('div');
            popover.className = popoverClass;
            const pre = document.createElement('pre');
            pre.textContent = tipText;
            popover.appendChild(pre);
            popover.style.left = `${anchorX}px`;
            popover.style.top = `${anchorY}px`;
            document.body.appendChild(popover);
            activePopover = popover;

            const rect = popover.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 8) popover.style.top = `${anchorY - rect.height - 4}px`;
            if (rect.right > window.innerWidth - 8) popover.style.left = `${anchorX - rect.width - 16}px`;
        };

        icon.addEventListener('mouseenter', (event) => show(event.clientX + 14, event.clientY + 22));
        icon.addEventListener('mousemove', (event) => {
            if (!activePopover) return;
            activePopover.style.left = `${event.clientX + 14}px`;
            activePopover.style.top = `${event.clientY + 22}px`;
        });
        icon.addEventListener('mouseleave', hideInfoPopover);
        icon.addEventListener('focus', () => {
            const rect = icon.getBoundingClientRect();
            show(rect.right + 8, rect.top);
        });
        icon.addEventListener('blur', hideInfoPopover);
    });
}
