/**
 * features/timeseries/seriesCollapse — series chip collapse/expand toggle.
 *
 * Manages the collapsed/expanded state of the series chip list and applies
 * the visual collapse threshold. Extracted from columnsController so the
 * collapse concern has a clear owner.
 */

let _seriesCollapsed = false;

export function initSeriesCollapse(): void {
    const btn = document.getElementById('collapse-series-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        _seriesCollapsed = !_seriesCollapsed;
        updateCollapseButton(btn);
        applyCollapse();
    });
}

function updateCollapseButton(btn: HTMLElement): void {
    btn.title = _seriesCollapsed ? 'Expand series list' : 'Collapse series list';
    btn.setAttribute('aria-label', _seriesCollapsed ? 'Expand series list' : 'Collapse series list');
    const svg = btn.querySelector('svg');
    if (svg) {
        svg.style.transform = _seriesCollapsed ? 'rotate(180deg)' : '';
    }
}

export function applyCollapse(): void {
    const chips = document.querySelectorAll<HTMLElement>('#column-toggles .series-chip');
    const collapseThreshold = 3;
    chips.forEach((chip, i) => {
        if (!_seriesCollapsed || i < collapseThreshold) {
            (chip as HTMLElement).style.display = '';
        } else {
            (chip as HTMLElement).style.display = 'none';
        }
    });

    const container = document.getElementById('column-toggles');
    if (_seriesCollapsed && container) {
        let existingBadge = container.querySelector('.collapse-badge');
        if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'collapse-badge';
            badge.id = 'series-collapse-badge';
            container.appendChild(badge);
        }
        const badge = container.querySelector('#series-collapse-badge');
        if (badge) {
            badge.textContent = `+${chips.length - collapseThreshold} more`;
            (badge as HTMLElement).style.display = '';
        }
    } else {
        const badge = document.getElementById('series-collapse-badge');
        if (badge) (badge as HTMLElement).style.display = 'none';
    }
}