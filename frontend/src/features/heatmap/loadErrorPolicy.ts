export interface HeatmapLoadErrorPresentation {
    message: string;
    reason: 'no-columns-available' | 'render-failure';
    title: string;
    status: string;
}

export function classifyHeatmapLoadError(error: unknown): HeatmapLoadErrorPresentation {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();
    const insufficientColumns = normalized.includes('two')
        || normalized.includes('numeric')
        || normalized.includes('column');
    if (insufficientColumns) {
        return {
            message: 'Need at least two numeric columns to compute correlations. Upload a dataset with multiple numeric columns.',
            reason: 'no-columns-available',
            title: 'Need at least two numeric columns',
            status: 'Not enough numeric columns',
        };
    }
    return {
        message: 'Correlation heatmap is unavailable for the current dataset.',
        reason: 'render-failure',
        title: 'Correlation matrix unavailable',
        status: `Error: ${message || 'failed'}`,
    };
}
