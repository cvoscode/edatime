import { describe, expect, it, vi } from 'vitest';
import { createCausalEntrypoint } from './entrypoint.js';

describe('createCausalEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = {
            getMetadata: vi.fn().mockReturnValue(null),
            chipColor: vi.fn(),
            numericColumns: vi.fn().mockReturnValue([]),
            setLoading: vi.fn(),
        };
        const entrypoint = createCausalEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call any dep before init', () => {
        const deps = {
            getMetadata: vi.fn().mockReturnValue(null),
            chipColor: vi.fn(),
            numericColumns: vi.fn().mockReturnValue([]),
            setLoading: vi.fn(),
        };
        createCausalEntrypoint(deps);
        expect(deps.getMetadata).not.toHaveBeenCalled();
        expect(deps.chipColor).not.toHaveBeenCalled();
        expect(deps.numericColumns).not.toHaveBeenCalled();
        expect(deps.setLoading).not.toHaveBeenCalled();
    });
});
