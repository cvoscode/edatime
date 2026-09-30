import { formatTwoDecimals } from '../formatUtils.js';
import { getPlotColorScale } from '../utils/settings.js';
import { COLOR_SCALES } from '../utils/colorScales.js';
import { categoryColorFor, type ColorScaleInfo } from './colorScale.js';

function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

export function renderColorScaleLegend(column: string | null, scaleInfo: ColorScaleInfo | null): void {
    const colorbar = document.getElementById('timeseries-colorbar-wrap');
    const categorical = document.getElementById('timeseries-categorical-wrap');
    if (colorbar) { colorbar.hidden = true; colorbar.style.display = 'none'; }
    if (categorical) { categorical.hidden = true; categorical.style.display = 'none'; }
    if (!column || !scaleInfo) return;

    if (scaleInfo.isNumeric && colorbar) {
        colorbar.hidden = false;
        colorbar.style.display = 'grid';
        setText('timeseries-colorbar-name', column);
        setText('timeseries-colorbar-min', formatTwoDecimals(scaleInfo.min));
        setText('timeseries-colorbar-max', formatTwoDecimals(scaleInfo.max));
        const caption = document.getElementById('timeseries-colorbar-caption');
        if (caption) {
            const activeChips = document.querySelectorAll('#column-toggles .series-chip.active');
            const onlyChip = activeChips.length === 1 ? activeChips[0] as HTMLElement : null;
            caption.textContent = onlyChip?.dataset.col === column
                ? `Single series colored by its own values (${formatTwoDecimals(scaleInfo.min)}..${formatTwoDecimals(scaleInfo.max)}).`
                : `Coloring by ${column} (${formatTwoDecimals(scaleInfo.min)}..${formatTwoDecimals(scaleInfo.max)})`;
        }
        const scale = getPlotColorScale('signals');
        const colors = COLOR_SCALES[scale] ?? COLOR_SCALES.viridis;
        const bar = document.getElementById('timeseries-colorbar');
        if (bar) bar.style.background = `linear-gradient(90deg, ${colors.join(',')})`;
        return;
    }

    if (!scaleInfo.isNumeric && categorical) {
        categorical.hidden = false;
        categorical.style.display = 'grid';
        setText('timeseries-categorical-name', column);
        const legend = document.getElementById('timeseries-categorical-legend');
        if (!legend) return;
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
