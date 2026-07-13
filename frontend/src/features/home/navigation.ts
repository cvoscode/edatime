export function wireHomeNavigationCards(showPage: (page: string) => void): () => void {
    const listenerController = new AbortController();
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        }, { signal: listenerController.signal });
    });
    return () => listenerController.abort();
}
