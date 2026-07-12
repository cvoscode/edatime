import type { SpectrogramResult } from '../../services/api/index.js';

export interface SpectrogramSummaryMetrics {
    sampleRate: string;
    nyquist: string;
    timePoints: string;
    frequencyBins: string;
}

export interface SpectrogramSummaryLabelInput {
    result: SpectrogramResult;
    windowSize: number;
    hopSize: number;
    scaleLabel: string;
    peakLabel?: string;
}

export function buildSpectrogramSummaryMetrics(result: SpectrogramResult): SpectrogramSummaryMetrics {
    const times = result.times_ms;
    const spanMs = Math.max(0, Number(times[times.length - 1] ?? 0) - Number(times[0] ?? 0));
    const sampleRateHz = spanMs > 0 && times.length > 1
        ? ((times.length - 1) * 1000) / spanMs
        : Number.NaN;
    const nyquistHz = Number.isFinite(sampleRateHz) ? sampleRateHz / 2 : Number.NaN;
    return {
        sampleRate: formatFrequency(sampleRateHz),
        nyquist: formatFrequency(nyquistHz),
        timePoints: times.length.toLocaleString(),
        frequencyBins: result.frequencies.length.toLocaleString(),
    };
}

export function buildSpectrogramSummaryLabel({
    result,
    windowSize,
    hopSize,
    scaleLabel,
    peakLabel,
}: SpectrogramSummaryLabelInput): string {
    return [
        `Spectrogram of ${result.column}`,
        `Window ${windowSize}`,
        `Hop ${hopSize}`,
        scaleLabel,
        peakLabel ? `Peak ${peakLabel}` : null,
    ].filter(Boolean).join(' · ');
}

export function renderSpectrogramSummary(root: HTMLElement | null, result: SpectrogramResult | null): void {
    if (!root) return;
    if (!result) {
        root.hidden = true;
        return;
    }
    const metrics = buildSpectrogramSummaryMetrics(result);
    setText(root, 'spectrogram-summary-rate', metrics.sampleRate);
    setText(root, 'spectrogram-summary-nyquist', metrics.nyquist);
    setText(root, 'spectrogram-summary-points', metrics.timePoints);
    setText(root, 'spectrogram-summary-bins', metrics.frequencyBins);
    root.hidden = false;
}

function setText(root: HTMLElement, id: string, value: string): void {
    const element = root.querySelector<HTMLElement>(`#${id}`);
    if (element) element.textContent = value;
}

function formatFrequency(hz: number): string {
    if (!Number.isFinite(hz)) return '—';
    if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
    if (hz >= 1) return `${hz.toFixed(2)} Hz`;
    return `${(hz * 1000).toFixed(2)} mHz`;
}
