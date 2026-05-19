import { lazy, Suspense, Component, onMount, onCleanup } from 'solid-js';
import { HashRouter, Route } from '@solidjs/router';
import AppShell from './components/layout/AppShell';
import { createSessionPersistence } from './stores/sessionStore';

const TimeseriesPage = lazy(() => import('./pages/TimeseriesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));
const HeatmapPage = lazy(() => import('./pages/HeatmapPage'));
const ScatterPage = lazy(() => import('./pages/ScatterPage'));
const FftPage = lazy(() => import('./pages/FftPage'));
const CausalPage = lazy(() => import('./pages/CausalPage'));
const DriftPage = lazy(() => import('./pages/DriftPage'));

const Loading: Component = () => <div class="loading">Loading...</div>;

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
  onMount(() => {
    persistence.start();

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
      <Route path="/fft" component={() => <Suspense fallback={<Loading />}><FftPage /></Suspense>} />
      <Route path="/heatmap" component={() => <Suspense fallback={<Loading />}><HeatmapPage /></Suspense>} />
      <Route path="/scatter" component={() => <Suspense fallback={<Loading />}><ScatterPage /></Suspense>} />
      <Route path="/drift" component={() => <Suspense fallback={<Loading />}><DriftPage /></Suspense>} />
      <Route path="/causal" component={() => <Suspense fallback={<Loading />}><CausalPage /></Suspense>} />
      <Route path="/settings" component={SettingsPage} />
    </HashRouter>
  );
};

export default App;