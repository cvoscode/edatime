import { onNavigationChange } from '../platform/navigationEvents.js';
import { getDropdownValue } from './primitives/Dropdown.js';

function activePage(): string {
    return document.querySelector<HTMLElement>('.nav-item.active[data-page]')?.dataset.page
        || document.querySelector<HTMLElement>('.page:not([hidden])[data-page-name]')?.dataset.pageName
        || 'home';
}

/** Shows parent context only when Pair plot is inspecting a concrete matrix pair. */
export function initBreadcrumbs(showPage: (page: string) => void): () => void {
    const lifetime = new AbortController();
    let queued = false;
    const render = () => {
        queued = false;
        document.querySelectorAll('.page-breadcrumb').forEach((node) => node.remove());
        const page = activePage();
        if (page !== 'scatter') return;
        const visible = document.querySelector<HTMLElement>('.page:not([hidden])');
        const header = visible?.querySelector<HTMLElement>('.page-header');
        if (!visible || !header) return;
        const x = getDropdownValue('scatter-x-col');
        const y = getDropdownValue('scatter-y-col');
        if (!x || !y) return;
        const nav = document.createElement('nav');
        nav.className = 'page-breadcrumb';
        nav.setAttribute('aria-label', 'Breadcrumb');
        const addLink = (text: string, target: string) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.addEventListener('click', () => showPage(target), { signal: lifetime.signal });
            nav.append(button);
        };
        addLink('Correlation matrix', 'correlations');
        nav.append(document.createTextNode('›'));
        const current = document.createElement('span');
        current.textContent = `${x} × ${y}`;
        current.setAttribute('aria-current', 'page');
        nav.append(current);
        header.insertAdjacentElement('afterend', nav);
    };
    const schedule = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(render);
    };
    const unsubscribe = onNavigationChange(schedule);
    document.addEventListener('change', (event) => {
        const id = (event.target as HTMLElement | null)?.id;
        if (id === 'scatter-x-col' || id === 'scatter-y-col') schedule();
    }, { signal: lifetime.signal });
    const observer = new MutationObserver((records) => {
        const pageContentChanged = records.some((record) => {
            if (record.type !== 'childList' || !(record.target as HTMLElement).closest?.('.page')) return false;
            const changedNodes = [...record.addedNodes, ...record.removedNodes];
            return changedNodes.some((node) => !(node instanceof HTMLElement && node.classList.contains('page-breadcrumb')));
        });
        if (pageContentChanged) schedule();
    });
    const content = document.querySelector('.app-content');
    if (content) observer.observe(content, { childList: true, subtree: true });
    schedule();
    return () => { lifetime.abort(); unsubscribe(); observer.disconnect(); };
}
