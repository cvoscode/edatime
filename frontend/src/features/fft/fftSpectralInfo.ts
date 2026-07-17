import type { FftTrace } from '../../chart/FftChart.js';
import { formatCyclesPerDay, formatFrequencyInUnit, formatReciprocalInterval, frequencyToPeriod, pickFrequencyUnit, useCyclesPerDayFrequencyAxis } from '../../utils/spectralPresets.js';

export interface FftSpectralInfo {
    visible: boolean;
    sampleRate: { text: string; title: string };
    nyquist: { text: string; title: string };
    peaks: Array<{ rank: string; frequency: string; period: string; power: string; title: string }>;
}

export function buildFftSpectralInfo(traces: readonly FftTrace[]): FftSpectralInfo {
    const trace = traces.find((entry) => Number.isFinite(entry.sample_rate_hz) && Number.isFinite(entry.nyquist_hz));
    if (!trace) return emptyInfo();
    const sampleRate = Number(trace.sample_rate_hz);
    const nyquist = Number(trace.nyquist_hz);
    const reference = Number.isFinite(nyquist) && nyquist > 0 ? nyquist : sampleRate;
    const unit = pickFrequencyUnit(reference);
    const formatFrequency = (hz: number) => useCyclesPerDayFrequencyAxis(reference)
        ? formatCyclesPerDay(hz, 2) : formatFrequencyInUnit(hz, unit, 2);
    const peaks = (trace.dominant_peaks ?? []).slice(0, 3).map((peak, index) => {
        const frequencyHz = Number(peak.frequency_hz);
        const power = Number(peak.power);
        const frequency = formatFrequency(frequencyHz);
        const period = frequencyToPeriod(frequencyHz);
        const powerText = Number.isFinite(power) ? power.toExponential(2) : '—';
        return {
            rank: `#${index + 1}`, frequency, period, power: powerText,
            title: `${index + 1}. ${frequency} · ${period} · power ${powerText} (r=${peak.rank ?? index + 1})`,
        };
    });
    return {
        visible: true,
        sampleRate: { text: formatReciprocalInterval(sampleRate), title: Number.isFinite(sampleRate) ? formatFrequencyInUnit(sampleRate, unit) : '' },
        nyquist: { text: formatReciprocalInterval(nyquist), title: Number.isFinite(nyquist) ? formatFrequencyInUnit(nyquist, unit) : '' },
        peaks,
    };
}

function emptyInfo(): FftSpectralInfo {
    return { visible: false, sampleRate: { text: '—', title: '' }, nyquist: { text: '—', title: '' }, peaks: [] };
}
