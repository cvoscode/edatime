const STYLE_MODULE_NAMES = ['drift', 'home', 'scatter'] as const;

export type StyleModuleName = typeof STYLE_MODULE_NAMES[number];

export function pageStyleModulesFor(_pageName: string): StyleModuleName[] {
    return [];
}

export function ensureStyleModule(_name: StyleModuleName): HTMLLinkElement | null {
    return null;
}

export function preloadPageStyles(_pageName: string): void {
    // Page CSS is bundled by Vite from frontend/css/style.css.
}
