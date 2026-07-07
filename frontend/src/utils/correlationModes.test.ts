import { describe, expect, it } from 'vitest';

import { getCorrelationModeBasisLabel } from './correlationModes.js';

describe('correlation mode basis labels', () => {
    it('describes raw modes as metric context instead of a warning-like status', () => {
        expect(getCorrelationModeBasisLabel('pearson_raw')).toBe('Raw values');
        expect(getCorrelationModeBasisLabel('spearman_raw')).toBe('Raw values');
        expect(getCorrelationModeBasisLabel('kendall_raw')).toBe('Raw values');
    });
});
