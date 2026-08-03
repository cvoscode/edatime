import { ensureStyleModule } from '../utils/pageStyles.js';

const TOGGLE_SELECTOR = '.page[data-toolbar-collapse]';

function toolbarHeaderFor(page: HTMLElement): HTMLElement | null {
    return page.querySelector<HTMLElement>(':scope > .page-header')
        ?? page.querySelector<HTMLElement>(':scope > #prepare-workspace > .prepare-workspace__header');
}

/**
 * Gives each workspace a quiet focus mode without changing the controls
 * themselves. The controls stay in the DOM, so page owners retain all their
 * existing state and event contracts.
 */
export function initToolbarCollapse(): () => void {
    const controller = new AbortController();
    const buttons: HTMLButtonElement[] = [];
    const pages = Array.from(document.querySelectorAll<HTMLElement>(TOGGLE_SELECTOR));
    ensureStyleModule('toolbarCollapse');

    const attach = (page: HTMLElement) => {
        if (page.dataset.toolbarCollapseReady === 'true') return;
        const header = toolbarHeaderFor(page);
        if (!header) return;
        page.dataset.toolbarCollapseReady = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost btn-sm toolbar-collapse-toggle';
        button.dataset.toolbarCollapseToggle = page.dataset.pageName ?? '';

        const label = document.createElement('span');
        label.className = 'toolbar-collapse-toggle__label';
        button.append(label);

        const sync = () => {
            const collapsed = page.classList.contains('workspace-controls-collapsed');
            button.setAttribute('aria-pressed', String(collapsed));
            button.title = collapsed ? 'Show workspace controls' : 'Focus view and hide workspace controls';
            button.setAttribute('aria-label', collapsed ? 'Show workspace controls' : 'Focus view');
            label.textContent = collapsed ? 'Show controls' : 'Focus view';
        };

        button.addEventListener('click', () => {
            page.classList.toggle('workspace-controls-collapsed');
            sync();
        }, { signal: controller.signal });

        const help = header.querySelector<HTMLElement>(':scope > .page-help-trigger');
        const primaryAction = header.querySelector<HTMLElement>(':scope > .btn-primary');
        header.insertBefore(button, help ?? primaryAction ?? null);
        buttons.push(button);
        sync();
    };

    pages.forEach(attach);
    const observer = new MutationObserver(() => pages.forEach(attach));
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
        controller.abort();
        observer.disconnect();
        buttons.forEach((button) => button.remove());
        pages.forEach((page) => {
            page.classList.remove('workspace-controls-collapsed');
            delete page.dataset.toolbarCollapseReady;
        });
    };
}
