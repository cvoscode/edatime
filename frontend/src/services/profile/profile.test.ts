import { describe, expect, it } from 'vitest';
import { getDefaultProfileColumnWidths, PROFILE_COLUMNS } from './profile.js';

describe('profile helpers', () => {
    it('derives default widths from profile column definitions', () => {
        expect(PROFILE_COLUMNS.map((column) => column.defaultWidth)).toEqual(getDefaultProfileColumnWidths());
    });
});
