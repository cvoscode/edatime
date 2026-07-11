import { describe, expect, it } from 'vitest';

import { setAdaptiveLineFilters } from '../store/index.js';
import { emitAdaptiveFiltersChange } from './eventHelpers.js';

describe('eventHelpers', () => {
    it('emits adaptive filter count from uiState without appStateCompat', () => {
        const events: Array<CustomEvent> = [];
        const listener = (event: Event) => {
            events.push(event as CustomEvent);
        };

        setAdaptiveLineFilters([
            { id: 'line-1', column: 'temp', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true },
            { id: 'line-2', column: 'humidity', x1: 5, y1: 6, x2: 7, y2: 8, keepAbove: false },
        ]);
        window.addEventListener('edatime:adaptive-filters-change', listener as EventListener);

        emitAdaptiveFiltersChange();

        window.removeEventListener('edatime:adaptive-filters-change', listener as EventListener);
        expect(events).toHaveLength(1);
        expect(events[0].detail).toEqual({ count: 2 });
    });
});
