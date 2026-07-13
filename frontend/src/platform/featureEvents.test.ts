import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearFeatureEventHandlers, emitFeatureEvent, onFeatureEvent } from './featureEvents.js';

afterEach(clearFeatureEventHandlers);

describe('featureEvents', () => {
    it('notifies active subscribers and stops after unsubscribe', () => {
        const handler = vi.fn();
        const unsubscribe = onFeatureEvent('workflow:refresh', handler);

        emitFeatureEvent('workflow:refresh', undefined);
        unsubscribe();
        emitFeatureEvent('workflow:refresh', undefined);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(undefined);
    });
});
