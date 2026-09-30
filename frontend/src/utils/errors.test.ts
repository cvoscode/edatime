import { describe, expect, it } from 'vitest';

import { errorMessage, isAbortError } from './errors.js';

describe('errorMessage', () => {
    it('reads the message of an Error', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('reads the message of an error-like object', () => {
        expect(errorMessage({ message: 'from server' })).toBe('from server');
    });

    it('stringifies other thrown values', () => {
        expect(errorMessage('plain string')).toBe('plain string');
        expect(errorMessage(42)).toBe('42');
    });

    it('returns an empty string when nothing was thrown meaningfully', () => {
        expect(errorMessage(undefined)).toBe('');
        expect(errorMessage(null)).toBe('');
        expect(errorMessage({})).toBe('');
    });
});

describe('isAbortError', () => {
    it('recognises DOMException aborts and named errors', () => {
        expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
        const named = new Error('x');
        named.name = 'AbortError';
        expect(isAbortError(named)).toBe(true);
    });

    it('rejects everything else', () => {
        expect(isAbortError(new Error('x'))).toBe(false);
        expect(isAbortError(undefined)).toBe(false);
        expect(isAbortError('AbortError')).toBe(false);
    });
});
