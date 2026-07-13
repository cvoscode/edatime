export function toggleLegendSeriesVisibility<T extends { name?: unknown; visible?: unknown }>(
    series: readonly T[],
    isTarget: (name: string) => boolean,
    currentlyVisible: boolean,
): T[] {
    const nextVisible = !currentlyVisible;
    return series.map((item) => {
        const name = typeof item?.name === 'string' ? item.name : '';
        return isTarget(name) ? { ...item, visible: nextVisible } : item;
    });
}
