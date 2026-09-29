import type { AnalysisSampling } from '../contracts/api/v1/analytics.js';

export function formatSamplingCadence(cadenceMs: number | null | undefined): string {
    if (!Number.isFinite(cadenceMs) || Number(cadenceMs) <= 0) return 'not available';
    const ms = Number(cadenceMs);
    const units: Array<{ size: number; name: string }> = [
        { size: 86_400_000, name: 'day' },
        { size: 3_600_000, name: 'hour' },
        { size: 60_000, name: 'min' },
        { size: 1_000, name: 's' },
        { size: 1, name: 'ms' },
    ];
    const unit = units.find(({ size }) => ms >= size) ?? units[units.length - 1]!;
    const amount = ms / unit.size;
    const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(amount < 100 ? 2 : 1);
    return `${formatted} ${unit.name}`;
}

export function formatAnalysisSamplingContext(sampling: AnalysisSampling): string {
    const source = formatSamplingCadence(sampling.source_cadence_ms);
    const effective = formatSamplingCadence(sampling.effective_cadence_ms);
    if (sampling.method === 'exact' || sampling.input_points === sampling.output_points) {
        return `Exact sampling · ${sampling.output_points.toLocaleString()} points · source and effective cadence ${source}`;
    }
    return `Block-mean downsampled · ${sampling.output_points.toLocaleString()} of ${sampling.input_points.toLocaleString()} points · source cadence ${source} · effective cadence ${effective}`;
}

/** Source-density estimate only; the response is authoritative after plan stages. */
export function estimateAnalysisSampling(
    metadata: { total_rows: number; time_range: { min: number; max: number } | null } | null | undefined,
    range: { startMs: number; endMs: number } | null | undefined,
    budget: number,
): AnalysisSampling | null {
    const time = metadata?.time_range;
    if (!time || !metadata || metadata.total_rows < 2 || time.max <= time.min || !Number.isFinite(budget) || budget < 2) return null;
    const start = Math.max(time.min, range?.startMs ?? time.min);
    const end = Math.min(time.max, range?.endMs ?? time.max);
    if (start >= end) return null;
    const cadence = (time.max - time.min) / (metadata.total_rows - 1);
    const input = Math.max(2, Math.round((end - start) / cadence) + 1);
    const output = Math.min(input, Math.floor(budget));
    return { method: input === output ? 'exact' : 'block_mean', input_points: input, output_points: output,
        aggregation_factor: input / output, source_cadence_ms: cadence, effective_cadence_ms: cadence * input / output,
        source_start_ms: start, source_end_ms: end };
}

export function formatAnalysisTimeRange(sampling: AnalysisSampling): string {
    const { source_start_ms: start, source_end_ms: end } = sampling;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
    return `${new Date(start!).toISOString()} – ${new Date(end!).toISOString()} (UTC source coverage)`;
}

export function spectralResolutionText(sampling: AnalysisSampling): string {
    return `Shortest resolvable period ≈ ${formatSamplingCadence(2 * Number(sampling.effective_cadence_ms))}`;
}
