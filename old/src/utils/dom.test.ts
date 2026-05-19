/**
 * Tests for frontend/src/utils/dom.ts
 *
 * Validates DOM utility functions: escaping, downloads, element lookup, debounce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escapeHtml, getEl, debounce } from '../utils/dom';

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe("it&#39;s");
    });

    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('handles strings with no special characters', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    it('escapes multiple special characters together', () => {
        expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    });

    it('prevents XSS injection', () => {
        const xss = '<img src=x onerror=alert(1)>';
        const escaped = escapeHtml(xss);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
    });
});

describe('getEl', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="test-el">hello</div>';
    });

    it('returns the element when found', () => {
        const el = getEl('test-el');
        expect(el).not.toBeNull();
        expect(el!.textContent).toBe('hello');
    });

    it('returns null for nonexistent elements', () => {
        const el = getEl('does-not-exist');
        expect(el).toBeNull();
    });
});

describe('debounce', () => {
    it('delays execution until idle period', async () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('resets timer on each call', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        vi.advanceTimersByTime(50);
        debounced();
        vi.advanceTimersByTime(50);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('passes arguments to the debounced function', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced('a', 'b');
        vi.advanceTimersByTime(50);

        expect(fn).toHaveBeenCalledWith('a', 'b');
        vi.useRealTimers();
    });
});
