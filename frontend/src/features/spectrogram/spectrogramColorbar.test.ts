import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpectrogramColorbar, formatSpectrogramColorbarNumber } from './spectrogramColorbar.js';

function createColorbar() {
    document.body.innerHTML = `
        <div id="spectrogram-colorbar" hidden>
          <span data-role="cb-high">High</span>
          <div data-role="cb-track">
            <span class="scatter-colorbar-vbar"></span>
            <span data-role="cb-fill" hidden></span>
            <span data-role="cb-handle-high"></span>
            <span data-role="cb-handle-low"></span>
          </div>
          <span data-role="cb-low">Low</span>
          <span class="scatter-colorbar-vname"></span>
        </div>
    `;
    const root = document.getElementById('spectrogram-colorbar')!;
    const track = root.querySelector<HTMLElement>('[data-role="cb-track"]')!;
    Object.defineProperty(track, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ height: 100 }),
    });
    return root;
}

afterEach(() => vi.unstubAllGlobals());

describe('spectrogram colorbar', () => {
    it('renders global palette presentation and reset handle state', () => {
        const root = createColorbar();
        const controller = createSpectrogramColorbar({
            root,
            signal: new AbortController().signal,
            onRangeChange: vi.fn(),
        });

        controller.update({ bounds: { min: -2, max: 3 }, label: 'log10', palette: ['#111111', '#eeeeee'] });

        expect(root.hidden).toBe(false);
        expect(root.querySelector('[data-role="cb-high"]')?.textContent).toBe('High · 3.000');
        expect(root.querySelector('[data-role="cb-low"]')?.textContent).toBe('Low · -2.000');
        expect(root.querySelector('.scatter-colorbar-vname')?.textContent).toBe('log10');
        expect(root.querySelector<HTMLElement>('.scatter-colorbar-vbar')?.style.background).toContain('#eeeeee');
        expect(root.querySelector<HTMLElement>('[data-role="cb-handle-high"]')?.style.top).toBe('0%');
        expect(root.querySelector<HTMLElement>('[data-role="cb-fill"]')?.hidden).toBe(true);
    });

    it('updates the selected range while dragging and clears it on reset', () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const root = createColorbar();
        const onRangeChange = vi.fn();
        const controller = createSpectrogramColorbar({
            root,
            signal: new AbortController().signal,
            onRangeChange,
        });
        controller.update({ bounds: { min: 0, max: 100 }, label: 'raw', palette: ['#111111'] });
        const high = root.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        (high as any).setPointerCapture = vi.fn();
        (high as any).releasePointerCapture = vi.fn();

        high.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientY: 0, pointerId: 1 }));
        high.dispatchEvent(new PointerEvent('pointermove', { clientY: 50, pointerId: 1 }));
        high.dispatchEvent(new PointerEvent('pointerup', { clientY: 50, pointerId: 1 }));

        expect(controller.getRange()).toEqual({ min: 0, max: 50 });
        expect(high.style.top).toBe('50%');
        expect(onRangeChange).toHaveBeenCalled();

        root.dispatchEvent(new MouseEvent('dblclick'));
        expect(controller.getRange()).toBeNull();
        expect(high.style.top).toBe('0%');
    });

    it('formats extremes compactly', () => {
        expect(formatSpectrogramColorbarNumber(0.001)).toBe('0.001');
        expect(formatSpectrogramColorbarNumber(0.0001)).toBe('1.00e-4');
        expect(formatSpectrogramColorbarNumber(Number.NaN)).toBe('—');
    });
});
