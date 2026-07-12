import { describe, expect, it } from 'vitest';
import { syncSpectrogramClipControls, syncSpectrogramClipLabel } from './spectrogramClipControls.js';

describe('spectrogram clip controls', () => {
    it('keeps disabled clip controls hidden and explains how to enable them', () => {
        document.body.innerHTML = '<div id="spectrogram-clip-method"></div><input id="param"><div id="band"></div><span id="label"></span>';
        const method = document.getElementById('spectrogram-clip-method')!;
        const parameter = document.getElementById('param') as HTMLInputElement;
        const band = document.getElementById('band')!;
        syncSpectrogramClipControls({ enabled: false, methodRoot: method, parameter, band });
        syncSpectrogramClipLabel(document.getElementById('label'), 'iqr');
        expect(parameter.disabled).toBe(true);
        expect(parameter.title).toContain('Outliers');
        expect(band.classList.contains('is-hidden')).toBe(true);
        expect(document.getElementById('label')?.textContent).toBe('Clip k');
    });
});
