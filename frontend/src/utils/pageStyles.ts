const STYLE_MODULES = {
    drift: 'css/modules/drift.css?v=4',
    home: 'css/modules/home.css?v=1',
} as const;

type StyleModuleName = keyof typeof STYLE_MODULES;

export function pageStyleModulesFor(pageName: string): StyleModuleName[] {
    if (pageName === 'drift') return ['drift'];
    if (pageName === 'home') return ['home'];
    return [];
}

export function ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null {
    if (typeof document === 'undefined') return null;

    const existing = document.head.querySelector<HTMLLinkElement>(`link[data-edatime-style="${name}"]`);
    if (existing) return existing;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_MODULES[name];
    link.dataset.edatimeStyle = name;
    document.head.appendChild(link);
    return link;
}

export function preloadPageStyles(pageName: string): void {
    for (const moduleName of pageStyleModulesFor(pageName)) {
        ensureStyleModule(moduleName);
    }
}