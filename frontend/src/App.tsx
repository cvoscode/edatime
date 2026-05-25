import { Component, onMount, onCleanup } from 'solid-js';
import { HashRouter, Route } from '@solidjs/router';
import AppShell from '@/shared/layout/AppShell';
import { createSessionPersistence } from './stores/sessionStore';
import { datasetStore } from './stores';
import { fetchMetadata } from './services/api';

import TimeseriesPage from './pages/TimeseriesPage';
import SettingsPage from './pages/SettingsPage';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import PlaceholderPage from './pages/PlaceholderPage';
import HeatmapPage from './pages/HeatmapPage';
import ScatterPage from './pages/ScatterPage';
import FftPage from './pages/FftPage';
import CausalPage from './pages/CausalPage';
import DriftPage from './pages/DriftPage';

const PAGE_KEYS: Record<string, string> = {
  '1': '/upload',
  '2': '/timeseries',
  '3': '/scatter',
  '4': '/scatter',
  '6': '/fft',
  '7': '/heatmap',
  '9': '/causal',
  '0': '/drift',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

const App: Component = () => {
  const persistence = createSessionPersistence();
  onMount(async () => {
    persistence.start();

    // Sync metadata with server to handle case where data was loaded externally
    try {
      console.debug('[App] Fetching metadata from server...');
      const metadata = await fetchMetadata();
      console.debug('[App] Metadata response:', metadata);
      if (metadata && metadata.total_rows > 0) {
        console.debug('[App] Setting dataset store with metadata, numericCols:', metadata.numeric_columns);
        datasetStore.setMetadata({
          revision: metadata.revision,
          name: metadata.name ?? 'Loaded dataset',
          rowCount: metadata.total_rows,
          columns: metadata.columns.map(c => c.name),
          numericColumns: metadata.numeric_columns,
          timestampColumn: metadata.time_column ?? '',
          timeRange: metadata.time_range ? [metadata.time_range.min, metadata.time_range.max] : null,
          fileSize: 0,
          uploadedAt: new Date().toISOString(),
        });
        datasetStore.setColumns(metadata.column_profiles.map(cp => ({
          name: cp.name,
          type: cp.dtype.includes('int') || cp.dtype.includes('float') || cp.dtype.includes('double') ? 'numeric' :
            cp.dtype.includes('datetime') || cp.dtype.includes('date') ? 'datetime' : 'categorical',
          min: cp.min ?? undefined,
          max: cp.max ?? undefined,
          nullCount: cp.null_count,
        })));
        datasetStore.setNumericCols(metadata.numeric_columns);
        console.debug('[App] Dataset store updated successfully');
      } else {
        console.debug('[App] Server has no data loaded (total_rows=0)');
      }
    } catch (e) {
      console.debug('[App] Metadata fetch failed:', e);
      // Server has no data loaded yet - not an error, just means no dataset in memory
      console.debug('[App] No dataset loaded on server');
    }

    const onKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const key = String(event.key || '').toLowerCase();

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const route = PAGE_KEYS[key];
        if (route) {
          event.preventDefault();
          window.location.hash = route;
          return;
        }
      }

      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      // Shift+* shortcuts — dispatch custom events for active page to handle
      if (key === 'r' || key === 'z' || key === 'c' || key === 'p' || key === 'e') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('edatime:shortcut', { detail: { key } }));
      }
    };

    window.addEventListener('keydown', onKeydown);
    onCleanup(() => window.removeEventListener('keydown', onKeydown));
  });

  return (
  <HashRouter root={AppShell}>
    <Route path="/" component={HomePage} />
    <Route path="/upload" component={UploadPage} />
    <Route path="/timeseries" component={TimeseriesPage} />
    <Route path="/fft" component={FftPage} />
    <Route path="/heatmap" component={HeatmapPage} />
    <Route path="/scatter" component={ScatterPage} />
    <Route path="/drift" component={DriftPage} />
    <Route path="/causal" component={CausalPage} />
    <Route path="/settings" component={SettingsPage} />
  </HashRouter>
);
};

export default App;