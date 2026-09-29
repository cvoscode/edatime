import type { FftTrace } from '../../chart/FftChart.js';
import { formatCyclesPerDay, formatFrequencyInUnit, formatReciprocalInterval, frequencyToPeriod, pickFrequencyUnit, useCyclesPerDayFrequencyAxis } from '../../utils/spectralPresets.js';

export interface FftSpectralInfo {
    visible: boolean;
    sampleRate: { text: string; title: string };
    nyquist: { text: string; title: string };
    peaks: Array<{ rank: string; frequency: string; frequencyHz: number; period: string; power: string; title: string }>;
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
    const firstPositiveBin = Math.min(...trace.frequencies.filter((frequency) => Number.isFinite(frequency) && frequency > 0));
    const peaks = (trace.dominant_peaks ?? []).slice(0, 3).map((peak, index) => {
        const frequencyHz = Number(peak.frequency_hz);
        const power = Number(peak.power);
        const frequency = formatFrequency(frequencyHz);
        const period = frequencyToPeriod(frequencyHz);
        const powerText = Number.isFinite(power) ? power.toExponential(2) : '—';
        const isDc = frequencyHz === 0;
        const isRecordLengthTrend = !isDc && Number.isFinite(firstPositiveBin) && frequencyHz <= firstPositiveBin * 1.01;
        const classification = isDc ? 'DC' : isRecordLengthTrend ? 'Trend' : `#${index + 1}`;
        return {
            rank: classification, frequency, frequencyHz, period, power: powerText,
            title: isDc
                ? `DC (zero-frequency) component · PSD ${powerText} signal²/Hz`
                : isRecordLengthTrend
                    ? `Record-length trend bin · ${frequency} · ${period} · PSD ${powerText} signal²/Hz; do not interpret as a stable periodic cycle without detrending.`
                    : `${index + 1}. ${frequency} · ${period} · PSD ${powerText} signal²/Hz (r=${peak.rank ?? index + 1})`,
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
