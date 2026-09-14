const STYLE_MODULE_NAMES = ['causal', 'drift', 'home', 'scatter', 'toolbarCollapse'] as const;

export type StyleModuleName = typeof STYLE_MODULE_NAMES[number];

export type PageName = keyof typeof PAGE_STYLE_MODULES;

const PAGE_STYLE_MODULES = {
    causal: ['drift', 'causal'],
    correlations: ['scatter'],
    drift: ['drift'],
    home: ['home'],
    heatmap: ['scatter'],
    scatter: ['scatter'],
    scattermatrix: ['scatter'],
} as const satisfies Record<string, readonly StyleModuleName[]>;

const STYLE_HREFS = import.meta.glob('../../css/modules/*.css', {
    query: '?url',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export function pageStyleModulesFor(pageName: string): readonly StyleModuleName[] {
    return PAGE_STYLE_MODULES[pageName as PageName] ?? [];
}

export function ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null {
    const existing = document.head.querySelector<HTMLLinkElement>(`link[data-edatime-style="${name}"]`);
    if (existing) return existing;

    const env = import.meta as ImportMeta & { env?: { MODE?: string } };
    const href = STYLE_HREFS[`../../css/modules/${name}.css`]
        ?? (env.env?.MODE === 'test' ? `/__edatime_test_styles__/${name}.css` : undefined)
        ?? new URL(`../../css/modules/${name}.css`, import.meta.url).href;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('href', href);
    link.dataset.edatimeStyle = name;
    document.head.appendChild(link);
    return link;
}

export function preloadPageStyles(pageName: string): void {
    for (const name of pageStyleModulesFor(pageName)) {
        ensureStyleModule(name);
    }
}
