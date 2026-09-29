/**
 * Downsampling indicator for the Signals (Timeseries) page.
 *
 * Classifies the sampling contract for the current response and distinguishes
 * eligible observations, bounded sample candidates, returned rows, and chart
 * points handed to the renderer.
 */

export interface SamplingMeta {
    downsampled?: boolean | null;
    downsampleKnown?: boolean | null;
    /** True when the response explicitly reported approximate/envelope work. */
    approximate?: boolean | null;
    /** Distinguishes a false header from a missing/unknown header. */
    approximationKnown?: boolean | null;
    samplingAlgorithm?: string | null;
    returnedRows?: number | null;
    targetPoints?: number | null;
    filteredRows?: number | null;
    candidateRows?: number | null;
    droppedRows?: number | null;
    /** Total source rows represented by the active working dataset, when known. */
    sourceRows?: number | null;
    /** Observations inside the visible viewport, excluding lookaround rows. */
    visibleRows?: number | null;
    /** Points actually handed to the renderer after reduction. */
    renderedPoints?: number | null;
}

export type SamplingState =
    | { kind: 'unknown' }
    | { kind: 'exact'; rows: number | null; sourceRows?: number; renderedPoints?: number }
    | {
        kind: 'sampled';
        eligibleRows: number | null;
        candidateRows: number | null;
        returnedRows: number | null;
        target: number | null;
        ratio: number | null;
        algorithm: string | null;
        approximate: boolean;
        downsampled: boolean;
        sourceRows?: number;
        renderedPoints?: number;
    };

export interface SamplingIndicator {
    label: string;
    detail: string;
    level: 'info' | 'warn';
}

function countValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
}

/**
 * Classify using the full server contract. A candidate count smaller than the
 * eligible row count is approximate even if an older/contradictory response
 * says that final downsampling did not occur.
 */
export function classifySamplingState(meta: SamplingMeta | null | undefined): SamplingState {
    if (!meta) return { kind: 'unknown' };
    const eligibleRows = countValue(meta.visibleRows) ?? countValue(meta.filteredRows) ?? countValue(meta.returnedRows);
    const candidateRows = countValue(meta.candidateRows);
    const returnedRows = countValue(meta.returnedRows);
    const target = countValue(meta.targetPoints);
    const sourceRows = countValue(meta.sourceRows) ?? undefined;
    const renderedPoints = countValue(meta.renderedPoints) ?? undefined;
    const displayCounts = {
        ...(sourceRows === undefined ? {} : { sourceRows }),
        ...(renderedPoints === undefined ? {} : { renderedPoints }),
    };
    const filteredRows = countValue(meta.filteredRows);
    const candidateReduction = candidateRows !== null && filteredRows !== null && candidateRows < filteredRows;
    const finalReduction = returnedRows !== null && candidateRows !== null && returnedRows < candidateRows;
    const approximate = meta.approximate === true || candidateReduction;
    const downsampled = meta.downsampled === true || finalReduction;
    const hasDownsampleContract = meta.downsampleKnown === true || finalReduction;
    const approximationKnown = meta.approximationKnown !== false;
    const countsProveNoApproximation = filteredRows !== null && candidateRows !== null
        && returnedRows !== null && filteredRows === candidateRows && candidateRows === returnedRows;

    if (hasDownsampleContract && meta.downsampled === false && !downsampled && !approximate
        && (approximationKnown || countsProveNoApproximation)) {
        return {
            kind: 'exact',
            rows: eligibleRows,
            ...displayCounts,
        };
    }

    const approximationContractMissing = meta.approximationKnown === false && !approximate
        && !countsProveNoApproximation;
    if (approximationContractMissing || (!hasDownsampleContract && !approximate && !downsampled)) {
        return { kind: 'unknown' };
    }

    const ratio = target && eligibleRows !== null ? eligibleRows / target : null;
    return {
        kind: 'sampled',
        eligibleRows,
        candidateRows,
        returnedRows,
        target,
        ratio,
        algorithm: String(meta.samplingAlgorithm ?? '').trim() || null,
        approximate,
        downsampled,
        ...displayCounts,
    };
}

function formatCount(value: number | null | undefined): string {
    return value == null ? '—' : value.toLocaleString('en-US');
}

/** Render a compact count trail from eligible observations to rendered points. */
export function formatSamplingIndicator(state: SamplingState): SamplingIndicator | null {
    if (state.kind === 'unknown') return null;
    if (state.kind === 'exact') {
        if (state.rows == null && state.renderedPoints == null) return null;
        return {
            label: 'Exact',
            detail: 'Showing ' + formatCount(state.renderedPoints ?? state.rows) + ' original observations',
            level: 'info',
        };
    }

    const algorithm = state.algorithm ? ' · ' + state.algorithm : '';
    const label = state.approximate && state.downsampled
        ? 'Approximate + reduced'
        : state.approximate
            ? (state.algorithm?.toLowerCase().includes('envelope') ? 'Envelope sample' : 'Approximate sample')
            : 'Downsampled';
    const countTrail: string[] = [];
    if (state.eligibleRows !== null) countTrail.push(formatCount(state.eligibleRows) + ' eligible observations');
    if (state.candidateRows !== null) countTrail.push(formatCount(state.candidateRows) + ' candidates');
    if (state.returnedRows !== null) countTrail.push(formatCount(state.returnedRows) + ' returned');
    let detail = countTrail.join(' → ');
    if (!detail && state.target !== null) detail = 'Target ~' + formatCount(state.target) + ' points';
    if (!detail) detail = 'Sampling or reduction was applied';
    if (state.renderedPoints !== undefined) detail += ' · ' + formatCount(state.renderedPoints) + ' rendered';
    if (state.downsampled) detail += ' · final reduction';
    detail += algorithm;
    return { label, detail, level: 'warn' };
}
