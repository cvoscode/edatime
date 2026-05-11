import { lazy, Suspense, Component } from 'solid-js';
import { HashRouter, Route } from '@solidjs/router';
import AppShell from './components/layout/AppShell';

const TimeseriesPage = lazy(() => import('./pages/TimeseriesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));

const Loading: Component = () => <div class="loading">Loading...</div>;

const App: Component = () => {
  return (
    <HashRouter root={AppShell}>
      <Route path="/" component={HomePage} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/timeseries" component={TimeseriesPage} />
      <Route path="/fft" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="FFT Analysis" /></Suspense>} />
      <Route path="/spectrogram" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="Spectrogram" /></Suspense>} />
      <Route path="/heatmap" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="Heatmap" /></Suspense>} />
      <Route path="/scatter" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="Scatter Plot" /></Suspense>} />
      <Route path="/drift" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="Drift Detection" /></Suspense>} />
      <Route path="/causal" component={() => <Suspense fallback={<Loading />}><PlaceholderPage title="Causal Analysis" /></Suspense>} />
      <Route path="/settings" component={SettingsPage} />
    </HashRouter>
  );
};

export default App;