/**
 * Tests for frontend/src/ui/upload.ts
 *
 * Covers: setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata, formatUploadRowCount } from './upload';
import type { DatasetMetadata } from '../types';

describe('formatUploadRowCount', () => {
    it('formats small counts without suffixes', () => {
        expect(formatUploadRowCount(512)).toBe('512');
    });

    it('formats thousands with K suffix', () => {
        expect(formatUploadRowCount(4_500)).toBe('5K');
    });

    it('formats millions with M suffix', () => {
        expect(formatUploadRowCount(1_250_000)).toBe('1.3M');
    });
});

describe('setUploadPreviewStatus', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="upload-preview-status"></div>';
    });

    it('sets text content', () => {
        setUploadPreviewStatus('Loading…');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.textContent).toBe('Loading…');
    });

    it('applies kind class', () => {
        setUploadPreviewStatus('Ready', 'success');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status success');
    });

    it('clears kind class when empty', () => {
        setUploadPreviewStatus('Neutral');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status');
    });

    it('replaces previous kind class', () => {
        setUploadPreviewStatus('Err', 'error');
        setUploadPreviewStatus('Ok', 'success');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status success');
        expect(el.textContent).toBe('Ok');
    });

    it('is a no-op when element is missing', () => {
        document.body.innerHTML = '';
        expect(() => setUploadPreviewStatus('noop')).not.toThrow();
    });
});

describe('setProfileMode', () => {
    beforeEach(() => {
        document.body.innerHTML = '<span id="profile-mode-badge" data-mode="dataset">Current dataset</span>';
    });

    it('sets dataset mode', () => {
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Current dataset');
    });

    it('sets preview mode', () => {
        setProfileMode('preview');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('preview');
        expect(el.textContent).toBe('Upload preview');
    });

    it('toggles between modes', () => {
        setProfileMode('preview');
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Current dataset');
    });

    it('is a no-op when element is missing', () => {
        document.body.innerHTML = '';
        expect(() => setProfileMode('preview')).not.toThrow();
    });
});

describe('applyPartialTimeRangeFromMetadata', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="time-start-input" type="datetime-local" />
            <input id="time-end-input" type="datetime-local" />
            <span id="time-range-hint"></span>
        `;
    });

    it('populates inputs from metadata time range', () => {
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        const end = document.getElementById('time-end-input') as HTMLInputElement;
        expect(start.value).not.toBe('');
        expect(end.value).not.toBe('');
        expect(start.min).not.toBe('');
        expect(end.max).not.toBe('');
    });

    it('shows hint when time range is not detected', () => {
        applyPartialTimeRangeFromMetadata(null);
        const hint = document.getElementById('time-range-hint')!;
        expect(hint.textContent).toBe('Time range not detected in this file.');
    });

    it('clears input bounds when metadata has no range', () => {
        const meta: DatasetMetadata = {
            total_rows: 50,
            columns: [],
            numeric_columns: [],
            time_column: null,
            time_range: null,
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        expect(start.min).toBe('');
        expect(start.max).toBe('');
    });

    it('does not overwrite inputs when overwriteInputs is false and values exist', () => {
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        start.value = '2023-01-01T00:00';
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta, false);
        // value should remain as the user's input
        expect(start.value).toBe('2023-01-01T00:00');
    });

    it('is a no-op when inputs are missing', () => {
        document.body.innerHTML = '';
        expect(() => applyPartialTimeRangeFromMetadata(null)).not.toThrow();
    });

    it('shows detected range hint', () => {
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const hint = document.getElementById('time-range-hint')!;
        expect(hint.textContent).toContain('Detected:');
    });
});
