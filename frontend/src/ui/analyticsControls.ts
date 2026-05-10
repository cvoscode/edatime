import { appState } from '../state.js';

export function initAnalyticsControls(): void {
    const rollingCheck = document.getElementById('rolling-enabled') as HTMLInputElement | null;
    const rollingWindowInput = document.getElementById('rolling-window') as HTMLInputElement | null;
    const anomalyCheck = document.getElementById('anomaly-enabled') as HTMLInputElement | null;
    const anomalyMethodSelect = document.getElementById('anomaly-method') as HTMLSelectElement | null;
    const anomalyThresholdInput = document.getElementById('anomaly-threshold') as HTMLInputElement | null;
    const transformOpenBtn = document.getElementById('transform-open-btn') as HTMLElement | null;

    const dispatchAnalyticsChange = () => window.dispatchEvent(new CustomEvent('edatime:analytics-change'));

    if (rollingCheck && !rollingCheck.dataset.bound) {
        rollingCheck.addEventListener('change', () => {
            appState.rollingEnabled = rollingCheck.checked;
            dispatchAnalyticsChange();
        });
        rollingCheck.dataset.bound = '1';
    }
    if (rollingWindowInput && !rollingWindowInput.dataset.bound) {
        let rollingDebounce: ReturnType<typeof setTimeout> | null = null;
        rollingWindowInput.addEventListener('input', () => {
            const v = parseInt(rollingWindowInput.value, 10);
            if (Number.isFinite(v) && v >= 3) {
                appState.rollingWindow = v;
                if (appState.rollingEnabled) {
                    if (rollingDebounce) clearTimeout(rollingDebounce);
                    rollingDebounce = setTimeout(dispatchAnalyticsChange, 300);
                }
            }
        });
        rollingWindowInput.dataset.bound = '1';
    }
    if (anomalyCheck && !anomalyCheck.dataset.bound) {
        anomalyCheck.addEventListener('change', () => {
            appState.anomalyEnabled = anomalyCheck.checked;
            dispatchAnalyticsChange();
        });
        anomalyCheck.dataset.bound = '1';
    }
    if (anomalyMethodSelect && !anomalyMethodSelect.dataset.bound) {
        anomalyMethodSelect.addEventListener('change', () => {
            appState.anomalyMethod = anomalyMethodSelect.value;
            if (appState.anomalyEnabled) dispatchAnalyticsChange();
        });
        anomalyMethodSelect.dataset.bound = '1';
    }
    if (anomalyThresholdInput && !anomalyThresholdInput.dataset.bound) {
        let threshDebounce: ReturnType<typeof setTimeout> | null = null;
        anomalyThresholdInput.addEventListener('input', () => {
            const v = parseFloat(anomalyThresholdInput.value);
            if (Number.isFinite(v) && v > 0) {
                appState.anomalyThreshold = v;
                if (appState.anomalyEnabled) {
                    if (threshDebounce) clearTimeout(threshDebounce);
                    threshDebounce = setTimeout(dispatchAnalyticsChange, 300);
                }
            }
        });
        anomalyThresholdInput.dataset.bound = '1';
    }
    if (transformOpenBtn && !transformOpenBtn.dataset.bound) {
        transformOpenBtn.addEventListener('click', () => {
            const modal = document.getElementById('transform-modal');
            if (modal) modal.hidden = false;
        });
        transformOpenBtn.dataset.bound = '1';
    }
}