import { describe, expect, it, vi } from 'vitest';
import { createCausalEntrypoint } from './entrypoint.js';

describe('createCausalEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = {
            workspace: { getSnapshot: vi.fn() },
            chipColor: vi.fn(),
            setLoading: vi.fn(),
        };
        const entrypoint = createCausalEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call any dep before init', () => {
        const deps = {
            workspace: { getSnapshot: vi.fn() },
            chipColor: vi.fn(),
            setLoading: vi.fn(),
        };
        createCausalEntrypoint(deps);
        expect(deps.workspace.getSnapshot).not.toHaveBeenCalled();
        expect(deps.chipColor).not.toHaveBeenCalled();
        expect(deps.setLoading).not.toHaveBeenCalled();
    });
});
