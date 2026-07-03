import { describe, expect, it } from 'vitest';

import { getCorrelationModeBasisLabel } from './correlationModes.js';

describe('correlation mode basis labels', () => {
    it('describes raw modes as metric context instead of a warning-like status', () => {
        expect(getCorrelationModeBasisLabel('pearson_raw')).toBe('Original level comparison');
        expect(getCorrelationModeBasisLabel('spearman_raw')).toBe('Original level comparison');
        expect(getCorrelationModeBasisLabel('kendall_raw')).toBe('Original level comparison');
    });
});
