import { ensureRelativePosition } from './chartInteractions.js';

export interface ChartTextOverlayContent {
    title: string;
    xLabel: string;
    yLabel: string;
}

/** Owns DOM creation, updates, and disposal for chart title and axis labels. */
export class TextOverlayController {
    private elements: HTMLElement[] = [];

    init(container: HTMLElement, content: ChartTextOverlayContent): void {
        this.destroy();
        ensureRelativePosition(container);
        this.elements = [
            this.createElement(container, 'chart-title-overlay'),
            this.createElement(container, 'chart-xlabel-overlay'),
            this.createElement(container, 'chart-ylabel-overlay'),
        ];
        this.sync(content);
    }

    sync({ title, xLabel, yLabel }: ChartTextOverlayContent): void {
        this.setText(this.elements[0], title);
        this.setText(this.elements[1], xLabel);
        this.setText(this.elements[2], yLabel);
    }

    destroy(): void {
        for (const element of this.elements) element.remove();
        this.elements = [];
    }

    private createElement(container: HTMLElement, className: string): HTMLElement {
        const element = document.createElement('div');
        element.className = `chart-text-overlay ${className}`;
        element.style.display = 'none';
        container.appendChild(element);
        return element;
    }

    private setText(element: HTMLElement | undefined, value: string): void {
        if (!element) return;
        const text = String(value ?? '').trim();
        element.textContent = text;
        element.style.display = text ? 'block' : 'none';
    }
}
