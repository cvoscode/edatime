import type { DatasetMetadata } from '../../contracts/api/v1/dataset.js';

export interface ZeroPlateauObservation {
    column: string;
    zeroCount: number;
    consecutiveRows: number;
    startMs: number | null;
    endMs: number | null;
}

/** Surface long contiguous zero runs only when their exact profile is available. */
export function findZeroPlateauObservations(
    metadata: DatasetMetadata | null,
    minimumRunRows = 24,
): ZeroPlateauObservation[] {
    if (metadata?.profile_status !== 'exact' || !Array.isArray(metadata.column_profiles)) return [];
    const threshold = Math.max(1, Math.floor(minimumRunRows));
    return metadata.column_profiles.flatMap((profile) => {
        const consecutiveRows = Number(profile.longest_zero_run);
        const zeroCount = Number(profile.zero_count);
        if (!Number.isFinite(consecutiveRows) || consecutiveRows < threshold || !Number.isFinite(zeroCount) || zeroCount < 1) return [];
        return [{
            column: profile.name,
            zeroCount,
            consecutiveRows,
            startMs: Number.isFinite(profile.longest_zero_run_start_ms) ? Number(profile.longest_zero_run_start_ms) : null,
            endMs: Number.isFinite(profile.longest_zero_run_end_ms) ? Number(profile.longest_zero_run_end_ms) : null,
        }];
    }).sort((left, right) => right.consecutiveRows - left.consecutiveRows);
}

export function formatZeroPlateauRange(startMs: number | null, endMs: number | null): string | null {
    if (startMs === null || endMs === null) return null;
    const format = (value: number) => new Date(value).toISOString() + ' (UTC)';
    return `${format(startMs)} – ${format(endMs)}`;
}
