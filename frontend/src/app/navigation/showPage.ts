/**
 * showPage — clicked a sidebar nav item to navigate to a page.
 * Extracted from app.ts for composition clarity.
 */

export function showPage(pageName: string): void {
    (document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`) as HTMLElement | null)?.click?.();
}