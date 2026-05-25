/**
 * UI store — manages theme, color scale, plot theme, sidebar, toasts, and upload panel.
 * Persists theme/colorScale/plotTheme to localStorage.
 */
import { createStore } from 'solid-js/store';
import type { ColorScaleName } from '../utils/colorScale';
import type { PlotThemeMode } from '../utils/plotTemplate';
import { addToast as sharedAddToast, removeToast as sharedRemoveToast } from '@/shared/ui/toast';

interface UiState {
  // Theme & presentation
  theme: 'dark' | 'light' | 'system';
  colorScale: ColorScaleName;
  plotTheme: PlotThemeMode;
  sidebarOpen: boolean;
  isUploadPanelOpen: boolean;
}

const STORAGE_KEY = 'edatime-theme';
const COLOR_SCALE_KEY = 'edatime-color-scale';
const PLOT_THEME_KEY = 'edatime-plot-theme';

function getSavedTheme(): 'dark' | 'light' | 'system' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
  } catch { }
  return 'dark';
}

function getSavedColorScale(): ColorScaleName {
  try {
    const saved = localStorage.getItem(COLOR_SCALE_KEY);
    if (saved === 'viridis' || saved === 'plasma' || saved === 'inferno' || saved === 'coolwarm' || saved === 'rdbu') {
      return saved;
    }
  } catch { }
  return 'rdbu';
}

function getSavedPlotTheme(): PlotThemeMode {
  try {
    const saved = localStorage.getItem(PLOT_THEME_KEY);
    if (saved === 'auto' || saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch { }
  return 'auto';
}

function resolveTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme;
}

function applyTheme(theme: 'dark' | 'light' | 'system') {
  const resolved = resolveTheme(theme);
  if (resolved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

if (typeof window !== 'undefined') {
  applyTheme(getSavedTheme());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const current = uiState.theme;
    if (current === 'system') {
      applyTheme('system');
    }
  });
}

const [uiState, setUiState] = createStore<UiState>({
  theme: getSavedTheme(),
  colorScale: getSavedColorScale(),
  plotTheme: getSavedPlotTheme(),
  sidebarOpen: true,
  isUploadPanelOpen: false,
});

export const uiStore = {
  get state() { return uiState; },

  setTheme(theme: 'dark' | 'light' | 'system') {
    setUiState('theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { }
    applyTheme(theme);
  },

  setColorScale(scale: ColorScaleName) {
    setUiState('colorScale', scale);
    try {
      localStorage.setItem(COLOR_SCALE_KEY, scale);
    } catch { }
  },

  setPlotTheme(mode: PlotThemeMode) {
    setUiState('plotTheme', mode);
    try {
      localStorage.setItem(PLOT_THEME_KEY, mode);
    } catch { }
  },

  toggleSidebar() {
    setUiState('sidebarOpen', !uiState.sidebarOpen);
  },

  addToast(toast: Parameters<typeof sharedAddToast>[0]) {
    sharedAddToast(toast);
  },

  removeToast: sharedRemoveToast,

  setUploadPanelOpen(open: boolean) {
    setUiState('isUploadPanelOpen', open);
  },

  reset() {
    setUiState({
      sidebarOpen: true,
      isUploadPanelOpen: false,
    });
    // Preserve theme, colorScale, plotTheme — they persist to localStorage
  },

  serialize() {
    return {
      theme: uiState.theme,
      colorScale: uiState.colorScale,
      plotTheme: uiState.plotTheme,
    };
  },

  deserialize(state: ReturnType<typeof this.serialize>) {
    setUiState({
      theme: state.theme ?? 'dark',
      colorScale: state.colorScale ?? 'rdbu',
      plotTheme: state.plotTheme ?? 'auto',
    });
  }
};