import { describe, expect, it, vi } from 'vitest';
import { LegendOverlayController } from './legendOverlayController.js';

describe('LegendOverlayController', () => {
    it('renders trace controls and delegates visibility changes to the chart owner', () => {
        const container = document.createElement('div');
        const onToggleTrace = vi.fn();
        const controller = new LegendOverlayController(container, {
            onToggleTrace,
            suppressChartHover: vi.fn(),
        });

        controller.sync([{ name: 'temperature', color: '#00aaff', visible: true }]);

        const button = container.querySelector<HTMLButtonElement>('.timeseries-legend-overlay__row');
        expect(button?.getAttribute('aria-pressed')).toBe('true');
        button?.click();
        expect(onToggleTrace).toHaveBeenCalledWith('temperature');
    });

    it('mirrors the Shift gesture hint and clears it when the overlay is removed', () => {
        const container = document.createElement('div');
        const controller = new LegendOverlayController(container, {
            onToggleTrace: vi.fn(),
            suppressChartHover: vi.fn(),
        });
        controller.sync([{ name: 'temperature', color: '#00aaff', visible: true }]);

        window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }));
        expect(container.classList.contains('is-shift-active')).toBe(true);
        expect(container.querySelector('.timeseries-legend-overlay')?.classList.contains('is-shift-active')).toBe(true);

        controller.sync([]);
        expect(container.classList.contains('is-shift-active')).toBe(false);
        expect(container.querySelector('.timeseries-legend-overlay')).toBeNull();
    });

    it('moves only with Shift and suppresses chart hover for the whole drag', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 300 });
        Object.defineProperty(container, 'clientHeight', { configurable: true, value: 180 });
        const suppressChartHover = vi.fn();
        const controller = new LegendOverlayController(container, {
            onToggleTrace: vi.fn(),
            suppressChartHover,
        });
        controller.sync([{ name: 'temperature', color: '#00aaff', visible: true }]);
        const legend = container.querySelector<HTMLElement>('.timeseries-legend-overlay')!;
        Object.defineProperty(legend, 'offsetWidth', { configurable: true, value: 120 });
        Object.defineProperty(legend, 'offsetHeight', { configurable: true, value: 60 });

        const pointerEvent = (type: string, values: Record<string, unknown>): PointerEvent => {
            const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
            Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
            return event;
        };

        legend.dispatchEvent(pointerEvent('pointerdown', {
            button: 0, pointerId: 5, clientX: 10, clientY: 10,
            shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
        }));
        legend.dispatchEvent(pointerEvent('pointermove', { pointerId: 5, clientX: 30, clientY: 25 }));
        expect(suppressChartHover).not.toHaveBeenCalled();

        legend.dispatchEvent(pointerEvent('pointerdown', {
            button: 0, pointerId: 7, clientX: 10, clientY: 10,
            shiftKey: true, ctrlKey: false, metaKey: false, altKey: false,
        }));
        legend.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 30, clientY: 25 }));
        legend.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 30, clientY: 25 }));

        expect(legend.style.left).toBe('172px');
        expect(legend.style.top).toBe('27px');
        expect(legend.classList.contains('is-dragging')).toBe(false);
        expect(suppressChartHover).toHaveBeenCalledTimes(3);
    });
});
