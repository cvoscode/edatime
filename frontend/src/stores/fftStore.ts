/**
 * FFT store — FFT traces, spectrogram config and results for frequency analysis.
 */
import { createStore } from 'solid-js/store';
import type { FftTrace, FftConfig, SpectrogramConfig, SpectrogramResult } from '../types';

interface FftState {
  activeTab: 'fft' | 'spectrogram';
  fftTraces: FftTrace[];
  fftConfig: FftConfig;
  fftError: string | null;
  spectrogramConfig: SpectrogramConfig;
  spectrogramResult: SpectrogramResult | null;
  spectrogramError: string | null;
  spectrogramLoading: boolean;
  fftLoading: boolean;
}

const defaultFftConfig: FftConfig = {
  mode: 'magnitude',
  logScale: true
};

const defaultSpectrogramConfig: SpectrogramConfig = {
  windowSize: 256,
  hopSize: 128,
  column: ''
};

const [fftState, setFftState] = createStore<FftState>({
  activeTab: 'fft',
  fftTraces: [],
  fftConfig: { ...defaultFftConfig },
  fftError: null,
  spectrogramConfig: { ...defaultSpectrogramConfig },
  spectrogramResult: null,
  spectrogramError: null,
  spectrogramLoading: false,
  fftLoading: false
});

export const fftStore = {
  get state() { return fftState; },

  setActiveTab(tab: 'fft' | 'spectrogram') {
    setFftState('activeTab', tab);
  },

  setFftTraces(traces: FftTrace[]) {
    setFftState('fftTraces', traces);
  },

  addFftTrace(trace: FftTrace) {
    setFftState('fftTraces', [...fftState.fftTraces.filter(t => t.column !== trace.column), trace]);
  },

  removeFftTrace(column: string) {
    setFftState('fftTraces', fftState.fftTraces.filter(t => t.column !== column));
  },

  clearFftTraces() {
    setFftState('fftTraces', []);
  },

  updateFftTraceColor(column: string, color: string) {
    setFftState('fftTraces', fftState.fftTraces.map(t =>
      t.column === column ? { ...t, color } : t
    ));
  },

  setFftConfig(config: Partial<FftConfig>) {
    setFftState('fftConfig', { ...fftState.fftConfig, ...config });
  },

  setFftError(error: string | null) {
    setFftState('fftError', error);
  },

  setFftLoading(loading: boolean) {
    setFftState('fftLoading', loading);
  },

  setSpectrogramConfig(config: Partial<SpectrogramConfig>) {
    setFftState('spectrogramConfig', { ...fftState.spectrogramConfig, ...config });
  },

  setSpectrogramResult(result: SpectrogramResult | null) {
    setFftState('spectrogramResult', result);
  },

  setSpectrogramError(error: string | null) {
    setFftState('spectrogramError', error);
  },

  setSpectrogramLoading(loading: boolean) {
    setFftState('spectrogramLoading', loading);
  },

  reset() {
    setFftState({
      activeTab: 'fft',
      fftTraces: [],
      fftConfig: { ...defaultFftConfig },
      fftError: null,
      spectrogramConfig: { ...defaultSpectrogramConfig },
      spectrogramResult: null,
      spectrogramError: null,
      spectrogramLoading: false,
      fftLoading: false
    });
  }
};