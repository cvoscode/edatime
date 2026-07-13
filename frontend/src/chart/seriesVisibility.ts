export interface VisibilitySeries {
    name?: unknown;
    visible?: unknown;
}

export function getVisibilityByBaseName(
    series: unknown,
    baseName: (name: string) => string,
): Map<string, boolean> {
    const visibility = new Map<string, boolean>();
    if (!Array.isArray(series)) return visibility;
    for (const item of series as VisibilitySeries[]) {
        const name = typeof item?.name === 'string' ? item.name : '';
        const base = baseName(name);
        if (base) visibility.set(base, item.visible !== false);
    }
    return visibility;
}
