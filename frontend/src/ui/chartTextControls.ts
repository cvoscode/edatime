/**
 * chartTextControls — chart title and axis label inputs.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { chartState, setChartText } from '../store/chartState.js';

export function initChartTextControls(): void {
    const titleInput = document.getElementById('chart-title-input') as HTMLInputElement | null;
    const xLabelInput = document.getElementById('x-axis-label-input') as HTMLInputElement | null;
    const yLabelInput = document.getElementById('y-axis-label-input') as HTMLInputElement | null;

    const applyChartText = () => {
        setChartText({
            title: titleInput?.value ?? chartState.chartText.title,
            xLabel: xLabelInput?.value ?? chartState.chartText.xLabel,
            yLabel: yLabelInput?.value ?? chartState.chartText.yLabel,
        });
        chartState.chart?.setChartText?.(chartState.chartText.title, chartState.chartText.xLabel, chartState.chartText.yLabel);
    };

    if (titleInput && !titleInput.dataset.bound) {
        titleInput.value = chartState.chartText.title || '';
        titleInput.addEventListener('input', applyChartText);
        titleInput.dataset.bound = '1';
    }
    if (xLabelInput && !xLabelInput.dataset.bound) {
        xLabelInput.value = chartState.chartText.xLabel || '';
        xLabelInput.addEventListener('input', applyChartText);
        xLabelInput.dataset.bound = '1';
    }
    if (yLabelInput && !yLabelInput.dataset.bound) {
        yLabelInput.value = chartState.chartText.yLabel || '';
        yLabelInput.addEventListener('input', applyChartText);
        yLabelInput.dataset.bound = '1';
    }

    applyChartText();
}
