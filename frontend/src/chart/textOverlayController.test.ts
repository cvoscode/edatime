import { describe, expect, it } from 'vitest';
import { TextOverlayController } from './textOverlayController.js';

describe('TextOverlayController', () => {
    it('renders normalized title and axis labels into the chart container', () => {
        const container = document.createElement('div');
        const controller = new TextOverlayController();
        controller.init(container, { title: '  Temperature  ', xLabel: ' Time ', yLabel: ' Value ' });

        expect(container.querySelector('.chart-title-overlay')?.textContent).toBe('Temperature');
        expect(container.querySelector('.chart-xlabel-overlay')?.textContent).toBe('Time');
        expect(container.querySelector('.chart-ylabel-overlay')?.textContent).toBe('Value');
    });

    it('hides empty labels and disposes all owned elements', () => {
        const container = document.createElement('div');
        const controller = new TextOverlayController();
        controller.init(container, { title: 'Chart', xLabel: 'Time', yLabel: 'Value' });
        controller.sync({ title: '', xLabel: ' ', yLabel: 'Value' });

        expect(container.querySelector<HTMLElement>('.chart-title-overlay')?.style.display).toBe('none');
        expect(container.querySelector<HTMLElement>('.chart-xlabel-overlay')?.style.display).toBe('none');
        expect(container.querySelector<HTMLElement>('.chart-ylabel-overlay')?.style.display).toBe('block');
        controller.destroy();
        expect(container.querySelector('.chart-text-overlay')).toBeNull();
    });
});
