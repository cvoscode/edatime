export function wireHomeNavigationCards(showPage: (page: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        });
    });
}
