export const CORRELATION_MODES = [
    'pearson_raw',
    'spearman_raw',
    'kendall_raw',
    'pearson_diff',
    'spearman_diff',
    'kendall_diff',
] as const;

export type CorrelationMetric = typeof CORRELATION_MODES[number];

const MODE_LABELS: Record<CorrelationMetric, string> = {
    pearson_raw: 'Pearson (raw)',
    spearman_raw: 'Spearman (raw)',
    kendall_raw: 'Kendall tau (raw)',
    pearson_diff: 'Pearson (Δ)',
    spearman_diff: 'Spearman (Δ)',
    kendall_diff: 'Kendall tau (Δ)',
};

const MODE_SHORT_LABELS: Record<CorrelationMetric, string> = {
    pearson_raw: 'Pearson',
    spearman_raw: 'Spearman',
    kendall_raw: 'Kendall tau',
    pearson_diff: 'Pearson Δ',
    spearman_diff: 'Spearman Δ',
    kendall_diff: 'Kendall tau Δ',
};

const MODE_BASIS_LABELS: Record<CorrelationMetric, string> = {
    pearson_raw: 'Raw values',
    spearman_raw: 'Raw values',
    kendall_raw: 'Raw values',
    pearson_diff: 'First differences',
    spearman_diff: 'First differences',
    kendall_diff: 'First differences',
};

const MODE_GUIDES: Record<CorrelationMetric, string> = {
    pearson_raw: 'Use for linear relationships on the original aligned values.',
    spearman_raw: 'Use for monotonic relationships and when rank ordering matters more than exact spacing.',
    kendall_raw: 'Use for a conservative rank-based agreement measure, especially with ties or smaller samples.',
    pearson_diff: 'Use when shared trends dominate and you want linear change-on-change relationships instead of level relationships.',
    spearman_diff: 'Use when you care about whether step-to-step changes move together monotonically, with less sensitivity to outliers.',
    kendall_diff: 'Use when you want a conservative rank-based view of whether step-to-step changes agree in direction.',
};

export function isCorrelationMetric(value: string): value is CorrelationMetric {
    return (CORRELATION_MODES as readonly string[]).includes(value);
}

export function normalizeCorrelationMetric(value: unknown): CorrelationMetric {
    if (value === 'pearson') return 'pearson_raw';
    if (value === 'spearman') return 'spearman_raw';
    if (typeof value === 'string' && isCorrelationMetric(value)) return value;
    return 'pearson_raw';
}

export function getCorrelationModeLabel(value: CorrelationMetric): string {
    return MODE_LABELS[value];
}

export function getCorrelationModeShortLabel(value: CorrelationMetric): string {
    return MODE_SHORT_LABELS[value];
}

export function getCorrelationModeBasisLabel(value: CorrelationMetric): string {
    return MODE_BASIS_LABELS[value];
}

export function getCorrelationModeGuide(value: CorrelationMetric): string {
    return MODE_GUIDES[value];
}
