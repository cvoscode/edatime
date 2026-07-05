import { describe, expect, it } from 'vitest';

import { formatUtcDatetimeInputValue } from './datetimeInput.js';

describe('formatUtcDatetimeInputValue', () => {
    it('formats UTC timestamps for datetime-local inputs without applying local timezone offsets', () => {
        const timestampMs = Date.UTC(2016, 6, 1, 0, 0, 0, 0);
        expect(formatUtcDatetimeInputValue(timestampMs)).toBe('2016-07-01T00:00');
    });
});
