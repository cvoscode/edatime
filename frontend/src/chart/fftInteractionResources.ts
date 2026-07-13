import {
    initBoxZoom,
    type BoxZoomHandle,
    type XOnlyBoxZoomOptions,
} from './chartInteractions.js';

/** Owns the FFT chart's disposable box-zoom binding. */
export class FftInteractionResources {
    private _selectionBox: BoxZoomHandle | null = null;

    mount(options: XOnlyBoxZoomOptions): void {
        this.dispose();
        this._selectionBox = initBoxZoom(options);
    }

    dispose(): void {
        this._selectionBox?.dispose();
        this._selectionBox = null;
    }
}
