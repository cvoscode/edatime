import { formatTwoDecimals } from '../formatUtils.js';
import { COLOR_SCALES, getSetting, type ColorScaleName } from '../utils/settings.js';
import { categoryColorFor, type ColorScaleInfo } from './colorScale.js';

export function renderColorScaleLegend(column: string | null, scaleInfo: ColorScaleInfo | null): void {
    const colorbar = document.getElementById('timeseries-colorbar-wrap');
    const categorical = document.getElementById('timeseries-categorical-wrap');
    if (colorbar) { colorbar.hidden = true; colorbar.style.display = 'none'; }
    if (categorical) { categorical.hidden = true; categorical.style.display = 'none'; }
    if (!column || !scaleInfo) return;

    if (scaleInfo.isNumeric && colorbar) {
        colorbar.hidden = false;
        colorbar.style.display = 'grid';
        document.getElementById('timeseries-colorbar-name')!.textContent = column;
        document.getElementById('timeseries-colorbar-min')!.textContent = formatTwoDecimals(scaleInfo.min);
        document.getElementById('timeseries-colorbar-max')!.textContent = formatTwoDecimals(scaleInfo.max);
        const scale = getSetting('colorScale') as ColorScaleName;
        const colors = COLOR_SCALES[scale] ?? COLOR_SCALES.viridis;
        document.getElementById('timeseries-colorbar')!.style.background = `linear-gradient(90deg, ${colors.join(',')})`;
        return;
    }

    if (!scaleInfo.isNumeric && categorical) {
        categorical.hidden = false;
        categorical.style.display = 'grid';
        document.getElementById('timeseries-categorical-name')!.textContent = column;
        const legend = document.getElementById('timeseries-categorical-legend')!;
        legend.replaceChildren();
        for (const category of scaleInfo.categories) {
            const item = document.createElement('div');
            item.className = 'scatter-distribution-legend-item';
            const swatch = document.createElement('span');
            swatch.className = 'scatter-distribution-legend-swatch';
            swatch.style.background = categoryColorFor(category, scaleInfo.categories);
            const label = document.createElement('span');
            label.textContent = category;
            item.append(swatch, label);
            legend.appendChild(item);
        }
    }
}
