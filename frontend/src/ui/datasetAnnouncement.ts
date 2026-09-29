import type { DatasetMetadata } from '../contracts/api/v1/dataset.js';

export function formatActiveDatasetAnnouncement(metadata: DatasetMetadata | null, versionId?: string | null): string {
    if (!metadata) return '';
    const name = metadata.display_name?.trim() || metadata.source_name?.trim() || versionId?.trim() || metadata.source_version_id?.trim() || 'Active dataset';
    const rows = Number(metadata.total_rows);
    const columns = Array.isArray(metadata.columns) && metadata.columns.length > 0
        ? metadata.columns.length
        : new Set([metadata.time_column, ...(metadata.numeric_columns || [])].filter(Boolean)).size;
    const numericColumns = Array.isArray(metadata.numeric_columns) ? metadata.numeric_columns.length : 0;
    const parts = [
        `Active dataset: ${name}${Number.isSafeInteger(metadata.source_version_revision ?? metadata.revision) ? `, revision ${metadata.source_version_revision ?? metadata.revision}` : ''}.`,
        `${Number.isFinite(rows) && rows >= 0 ? rows.toLocaleString() : 'Unknown'} rows, ${columns.toLocaleString()} columns, ${numericColumns.toLocaleString()} numeric columns.`,
    ];
    const start = Number(metadata.time_range?.min);
    const end = Number(metadata.time_range?.max);
    const dateLimit = 8_640_000_000_000_000;
    if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(start) <= dateLimit && Math.abs(end) <= dateLimit) {
        parts.push(`Time range ${new Date(start).toISOString()} to ${new Date(end).toISOString()}.`);
    } else {
        parts.push('Time range unavailable.');
    }
    return parts.join(' ');
}

export function announceActiveDataset(metadata: DatasetMetadata | null, versionId?: string | null): void {
    const region = document.getElementById('dataset-load-announcement');
    if (!region) return;
    region.textContent = formatActiveDatasetAnnouncement(metadata, versionId);
}
