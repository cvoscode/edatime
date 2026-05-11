import { createStore } from 'solid-js/store';
import type { RollingBandConfig, AnomalyConfig, SpectralConfig, ToastMessage } from '../types';

interface UiState {
  selectedColumns: string[];
  filters: Record<string, { min: number; max: number }>;
  colors: Record<string, string>;
  theme: 'dark' | 'light' | 'system';
  sidebarOpen: boolean;
  toasts: ToastMessage[];
  isUploadPanelOpen: boolean;
}

const defaultColors: Record<string, string> = {
  ts: '#4a9eff',
  default: '#888888'
};

const STORAGE_KEY = 'edatime-theme';

function getSavedTheme(): 'dark' | 'light' | 'system' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
  } catch {}
  return 'dark';
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
  selectedColumns: [],
  filters: {},
  colors: { ...defaultColors },
  theme: getSavedTheme(),
  sidebarOpen: true,
  toasts: [],
  isUploadPanelOpen: false
});

export const uiStore = {
  get state() { return uiState; },

  selectColumn(column: string) {
    if (!uiState.selectedColumns.includes(column)) {
      setUiState('selectedColumns', [...uiState.selectedColumns, column]);
    }
  },

  deselectColumn(column: string) {
    setUiState('selectedColumns', uiState.selectedColumns.filter(c => c !== column));
  },

  toggleColumn(column: string) {
    if (uiState.selectedColumns.includes(column)) {
      this.deselectColumn(column);
    } else {
      this.selectColumn(column);
    }
  },

  setSelectedColumns(columns: string[]) {
    setUiState('selectedColumns', columns);
  },

  setFilter(column: string, range: { min: number; max: number }) {
    setUiState('filters', column, range);
  },

  removeFilter(column: string) {
    setUiState('filters', (f) => {
      const copy = { ...f };
      delete copy[column];
      return copy;
    });
  },

  setColumnColor(column: string, color: string) {
    setUiState('colors', column, color);
  },

  setTheme(theme: 'dark' | 'light' | 'system') {
    setUiState('theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    applyTheme(theme);
  },

  toggleSidebar() {
    setUiState('sidebarOpen', !uiState.sidebarOpen);
  },

  addToast(toast: Omit<ToastMessage, 'id'>) {
    const id = Math.random().toString(36).slice(2);
    setUiState('toasts', [...uiState.toasts, { ...toast, id }]);

    if (toast.duration !== 0) {
      setTimeout(() => this.removeToast(id), toast.duration ?? 3000);
    }
  },

  removeToast(id: string) {
    setUiState('toasts', uiState.toasts.filter(t => t.id !== id));
  },

  setUploadPanelOpen(open: boolean) {
    setUiState('isUploadPanelOpen', open);
  }
};