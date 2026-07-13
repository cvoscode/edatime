import { createCanvasOverlay } from './chartInteractions.js';

/** Owns the FFT annotation canvas and its resize observer as one lifecycle. */
export class FftOverlayResources {
    private _canvas: HTMLCanvasElement | null = null;
    private _observer: ResizeObserver | null = null;

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    mount(container: HTMLElement, onResize: () => void): void {
        this.dispose();
        const { canvas, observer } = createCanvasOverlay(container, onResize);
        this._canvas = canvas;
        this._observer = observer;
    }

    dispose(): void {
        this._observer?.disconnect();
        this._observer = null;
        this._canvas?.remove();
        this._canvas = null;
    }
}
