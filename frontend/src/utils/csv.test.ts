import { describe, expect, it } from 'vitest';

import { escapeCsvField } from './csv.js';

describe('escapeCsvField', () => {
    it('quotes plain text fields', () => {
        expect(escapeCsvField('value')).toBe('"value"');
    });

    it('escapes embedded quotes', () => {
        expect(escapeCsvField('"quoted"')).toBe('"""quoted"""');
    });

    it('preserves commas and newlines inside the quoted field', () => {
        expect(escapeCsvField('a,b\nc')).toBe('"a,b\nc"');
    });
});
