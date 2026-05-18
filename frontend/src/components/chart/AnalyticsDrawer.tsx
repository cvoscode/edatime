import { Component, Show, createSignal, createEffect } from 'solid-js';
import { SwitchToggle } from '../ui';
import { analyticsStore } from '../../stores';
import { uiStore } from '../../stores/uiStore';
import styles from './AnalyticsDrawer.module.css';

interface AnalyticsDrawerProps {
  open: boolean;
  onClose: () => void;
  onRollingChange: (enabled: boolean, window: number) => void;
  onAnomalyChange: (enabled: boolean, method: string, threshold: number) => void;
}

const AnalyticsDrawer: Component<AnalyticsDrawerProps> = (props) => {
  const [rollingEnabled, setRollingEnabled] = createSignal(false);
  const [rollingWindow, setRollingWindow] = createSignal(50);
  const [rollingLoading, setRollingLoading] = createSignal(false);
  const [anomalyEnabled, setAnomalyEnabled] = createSignal(false);
  const [anomalyMethod, setAnomalyMethod] = createSignal('zscore');
  const [anomalyThreshold, setAnomalyThreshold] = createSignal(3);

  createEffect(() => {
    if (props.open) {
      setRollingEnabled(analyticsStore.state.rollingEnabled);
      setRollingWindow(analyticsStore.state.rollingWindow);
      setRollingLoading(analyticsStore.state.rollingLoading);
      setAnomalyEnabled(analyticsStore.state.anomalyEnabled);
      setAnomalyMethod(analyticsStore.state.anomalyMethod);
      setAnomalyThreshold(analyticsStore.state.anomalyThreshold);
    }
  });

  const handleRollingToggle = (checked: boolean) => {
    setRollingEnabled(checked);
    props.onRollingChange(checked, rollingWindow());
  };

  const handleRollingWindowChange = (value: number) => {
    setRollingWindow(value);
    props.onRollingChange(rollingEnabled(), value);
  };

  const handleAnomalyToggle = (checked: boolean) => {
    setAnomalyEnabled(checked);
    props.onAnomalyChange(checked, anomalyMethod(), anomalyThreshold());
  };

  const handleAnomalyMethodChange = (value: string) => {
    setAnomalyMethod(value);
    props.onAnomalyChange(anomalyEnabled(), value, anomalyThreshold());
  };

  const handleAnomalyThresholdChange = (value: number) => {
    setAnomalyThreshold(value);
    props.onAnomalyChange(anomalyEnabled(), anomalyMethod(), value);
  };

  return (
    <Show when={props.open}>
      <div class={styles.drawer}>
        <div class={styles.header}>
          <span class={styles.title}>Analytics</span>
          <button class={styles.closeBtn} onClick={props.onClose} aria-label="Close">×</button>
        </div>
        <div class={styles.body}>
          <div class={styles.section}>
            <div class={styles.sectionTitle}>Rolling bands</div>
            <label class={styles.toggleLabel}>
              <SwitchToggle
                checked={rollingEnabled()}
                onChange={(e) => handleRollingToggle(e.currentTarget.checked)}
              />
              <span>Show rolling mean ± σ bands</span>
              <Show when={rollingLoading()}>
                <span class={styles.spinner}>⟳</span>
              </Show>
            </label>
            <div class={styles.field}>
              <label for="rolling-window-input">Window size</label>
              <input
                type="number"
                id="rolling-window-input"
                value={rollingWindow()}
                min="2"
                step="1"
                onChange={(e) => handleRollingWindowChange(parseInt(e.currentTarget.value) || 50)}
              />
            </div>
          </div>

          <div class={styles.section}>
            <div class={styles.sectionTitle}>Anomalies</div>
            <label class={styles.toggleLabel}>
              <SwitchToggle
                checked={anomalyEnabled()}
                onChange={(e) => handleAnomalyToggle(e.currentTarget.checked)}
              />
              <span>Enable anomaly detection regions</span>
            </label>
            <div class={styles.field}>
              <label for="anomaly-method-select">Method</label>
              <select
                id="anomaly-method-select"
                value={anomalyMethod()}
                onChange={(e) => handleAnomalyMethodChange(e.currentTarget.value)}
              >
                <option value="zscore">Z-score</option>
                <option value="iqr">IQR</option>
              </select>
            </div>
            <div class={styles.field}>
              <label for="anomaly-threshold-input">Threshold</label>
              <input
                type="number"
                id="anomaly-threshold-input"
                value={anomalyThreshold()}
                min="0.5"
                step="0.5"
                onChange={(e) => handleAnomalyThresholdChange(parseFloat(e.currentTarget.value) || 3)}
              />
            </div>
          </div>

          <div class={styles.section}>
            <div class={styles.sectionTitle}>Dataset tools</div>
            <button class={styles.toolBtn} id="transform-btn" type="button" onClick={() => uiStore.addToast({ message: 'Transform: not yet implemented', type: 'info', duration: 3000 })}>Transform…</button>
            <button class={styles.toolBtn} id="outliers-btn" type="button" onClick={() => uiStore.addToast({ message: 'Outliers: not yet implemented', type: 'info', duration: 3000 })}>Outliers…</button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default AnalyticsDrawer;