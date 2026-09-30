import type { DatasetMetadata } from '../../contracts/api/v1/dataset.js';

/** Rows a sampled profile report was computed from. */
export function sampledProfileRowCount(metadata: DatasetMetadata): number {
    return metadata.profile_sampling?.sampled_rows ?? metadata.profile_sample_rows ?? metadata.total_rows;
}

/**
 * Method, coverage, and limits of a sampled profile report. Callers lead with
 * their own "estimates from N rows" sentence; this text follows it.
 */
export function sampledProfileDescription(metadata: DatasetMetadata): string {
    const sample = metadata.profile_sampling;
    const rows = sampledProfileRowCount(metadata);
    const method = sample?.method === 'stratified_source_rows_with_endpoints'
        ? 'Deterministic stratified sample across source rows, including endpoints'
        : `First ${rows.toLocaleString()} source rows`;
    const coverage = sample
        ? `${rows.toLocaleString()} / ${sample.source_rows.toLocaleString()} rows (${(100 * rows / Math.max(1, sample.source_rows)).toFixed(1)}%)`
        : 'full coverage unknown';
    const time = metadata.time_range;
    const range = time ? ` Observed interval: ${new Date(time.min).toISOString()} – ${new Date(time.max).toISOString()} (UTC).` : '';
    return `${method}; ${coverage}.${range} Distribution estimates can miss rare events and extrema; no statistical confidence interval is implied. Cadence and consecutive runs require the exact report.`;
}
