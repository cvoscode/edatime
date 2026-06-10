import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initBoxZoom } from './chartInteractions.js';

describe('initBoxZoom', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="chart"></div>';
    });

    it('converts a drag box into a full viewport snapshot with x and y ranges', () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onZoom = vi.fn();

        initBoxZoom({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        } as any);

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 60,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 200,
            clientY: 140,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1,
            clientX: 200,
            clientY: 140,
            bubbles: true,
        }));

        expect(onZoom).toHaveBeenCalledWith({
            xMin: 25,
            xMax: 75,
            yMin: 25,
            yMax: 75,
        });
    });

    it('treats a horizontal drag as an x-only viewport zoom', () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onZoom = vi.fn();

        initBoxZoom({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 10, max: 90 }),
            onZoom,
        } as any);

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 80,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 200,
            clientY: 82,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1,
            clientX: 200,
            clientY: 82,
            bubbles: true,
        }));

        expect(onZoom).toHaveBeenCalledWith({
            xMin: 25,
            xMax: 75,
            yMin: 10,
            yMax: 90,
        });
    });
});
