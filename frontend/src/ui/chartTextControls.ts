/**
 * chartTextControls — chart title and axis label inputs.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { appState } from '../state.js';

export function initChartTextControls(): void {
    const titleInput = document.getElementById('chart-title-input') as HTMLInputElement | null;
    const xLabelInput = document.getElementById('x-axis-label-input') as HTMLInputElement | null;
    const yLabelInput = document.getElementById('y-axis-label-input') as HTMLInputElement | null;

    const applyChartText = () => {
        appState.chartText = {
            title: titleInput?.value ?? appState.chartText.title,
            xLabel: xLabelInput?.value ?? appState.chartText.xLabel,
            yLabel: yLabelInput?.value ?? appState.chartText.yLabel,
        };
        appState.chart?.setChartText?.(appState.chartText.title, appState.chartText.xLabel, appState.chartText.yLabel);
    };

    if (titleInput && !titleInput.dataset.bound) {
        titleInput.value = appState.chartText.title || '';
        titleInput.addEventListener('input', applyChartText);
        titleInput.dataset.bound = '1';
    }
    if (xLabelInput && !xLabelInput.dataset.bound) {
        xLabelInput.value = appState.chartText.xLabel || '';
        xLabelInput.addEventListener('input', applyChartText);
        xLabelInput.dataset.bound = '1';
    }
    if (yLabelInput && !yLabelInput.dataset.bound) {
        yLabelInput.value = appState.chartText.yLabel || '';
        yLabelInput.addEventListener('input', applyChartText);
        yLabelInput.dataset.bound = '1';
    }

    applyChartText();
}