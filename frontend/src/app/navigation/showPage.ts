/**
 * showPage — clicked a sidebar nav item to navigate to a page.
 * Extracted from app.ts for composition clarity.
 */

export function showPage(pageName: string): void {
    const globalShowPage = (window as typeof globalThis & {
        __edatime?: { showPage?: (name: string) => void };
    }).__edatime?.showPage;
    if (globalShowPage) {
        globalShowPage(pageName);
        return;
    }
    (document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`) as HTMLElement | null)?.click?.();
}
