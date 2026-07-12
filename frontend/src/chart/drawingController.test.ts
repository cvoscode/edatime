import { describe, expect, it, vi } from 'vitest';
import { DrawingController } from './drawingController.js';

describe('DrawingController', () => {
    it('captures an enabled canvas gesture as a drawing and requests redraws', () => {
        const canvas = document.createElement('canvas');
        canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
        const onRender = vi.fn();
        const controller = new DrawingController(onRender);
        controller.attach(canvas);
        controller.setMode('box', '#00aaff', 3);

        const pointerEvent = (type: string, values: Record<string, unknown>): PointerEvent => {
            const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
            Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
            return event;
        };
        canvas.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 30, clientY: 50 }));
        canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 70, clientY: 100 }));
        canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 70, clientY: 100 }));

        expect(controller.items).toEqual([{
            type: 'box', color: '#00aaff', width: 3,
            startX: 20, startY: 30, endX: 60, endY: 80,
        }]);
        expect(controller.activeItem).toBeNull();
        expect(onRender).toHaveBeenCalled();
    });

    it('disables canvas input and clears committed and in-progress drawings', () => {
        const canvas = document.createElement('canvas');
        const controller = new DrawingController(vi.fn());
        controller.attach(canvas);
        controller.setMode('arrow');
        expect(canvas.style.pointerEvents).toBe('auto');
        controller.setMode('none');
        expect(canvas.style.pointerEvents).toBe('none');
        controller.clear();
        expect(controller.items).toEqual([]);
        expect(controller.activeItem).toBeNull();
    });
});
