import {
    analyticsState,
    setAnomalyEnabled,
    setAnomalyMethod,
    setAnomalyThreshold,
    setRollingEnabled,
    setRollingWindow,
} from '../store/index.js';
import { getDropdownValue } from './primitives/Dropdown.js';

export function initAnalyticsControls(): void {
    const rollingCheck = document.getElementById('rolling-enabled') as HTMLInputElement | null;
    const rollingWindowInput = document.getElementById('rolling-window') as HTMLInputElement | null;
    const anomalyCheck = document.getElementById('anomaly-enabled') as HTMLInputElement | null;
    const anomalyMethodSelect = document.getElementById('anomaly-method') as HTMLElement | null;
    const anomalyThresholdInput = document.getElementById('anomaly-threshold') as HTMLInputElement | null;
    const transformOpenBtn = document.getElementById('transform-open-btn') as HTMLElement | null;

    const dispatchAnalyticsChange = () => window.dispatchEvent(new CustomEvent('edatime:analytics-change'));

    if (rollingCheck && !rollingCheck.dataset.bound) {
        rollingCheck.addEventListener('change', () => {
            setRollingEnabled(rollingCheck.checked);
            dispatchAnalyticsChange();
        });
        rollingCheck.dataset.bound = '1';
    }
    if (rollingWindowInput && !rollingWindowInput.dataset.bound) {
        let rollingDebounce: ReturnType<typeof setTimeout> | null = null;
        rollingWindowInput.addEventListener('input', () => {
            const v = parseInt(rollingWindowInput.value, 10);
            if (Number.isFinite(v) && v >= 3) {
                setRollingWindow(v);
                if (analyticsState.rollingEnabled) {
                    if (rollingDebounce) clearTimeout(rollingDebounce);
                    rollingDebounce = setTimeout(dispatchAnalyticsChange, 300);
                }
            }
        });
        rollingWindowInput.dataset.bound = '1';
    }
    if (anomalyCheck && !anomalyCheck.dataset.bound) {
        anomalyCheck.addEventListener('change', () => {
            setAnomalyEnabled(anomalyCheck.checked);
            dispatchAnalyticsChange();
        });
        anomalyCheck.dataset.bound = '1';
    }
    if (anomalyMethodSelect && !anomalyMethodSelect.dataset.bound) {
        anomalyMethodSelect.addEventListener('change', () => {
            setAnomalyMethod(getDropdownValue('anomaly-method'));
            if (analyticsState.anomalyEnabled) dispatchAnalyticsChange();
        });
        anomalyMethodSelect.dataset.bound = '1';
    }
    if (anomalyThresholdInput && !anomalyThresholdInput.dataset.bound) {
        let threshDebounce: ReturnType<typeof setTimeout> | null = null;
        anomalyThresholdInput.addEventListener('input', () => {
            const v = parseFloat(anomalyThresholdInput.value);
            if (Number.isFinite(v) && v > 0) {
                setAnomalyThreshold(v);
                if (analyticsState.anomalyEnabled) {
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
