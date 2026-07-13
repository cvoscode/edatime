import { describe, expect, it } from 'vitest';

import { emitAdaptiveFiltersChange } from './eventHelpers.js';

describe('eventHelpers', () => {
    it('emits the feature-supplied adaptive filter count', () => {
        const events: Array<CustomEvent> = [];
        const listener = (event: Event) => {
            events.push(event as CustomEvent);
        };

        window.addEventListener('edatime:adaptive-filters-change', listener as EventListener);

        emitAdaptiveFiltersChange(2);

        window.removeEventListener('edatime:adaptive-filters-change', listener as EventListener);
        expect(events).toHaveLength(1);
        expect(events[0].detail).toEqual({ count: 2 });
    });
});
