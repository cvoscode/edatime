import type { TimeRange } from '../types/api.js';

export interface EmptyStateViewModel {
    visible: boolean;
    reason: string;
    title: string;
    message: string;
    showResetAction?: boolean;
    showClearAction?: boolean;
    fallbackText?: string;
}

interface EmptyStateElements {
    root: HTMLElement | null;
    title: HTMLElement | null;
    message: HTMLElement | null;
    resetButton: HTMLButtonElement | null;
    clearButton: HTMLButtonElement | null;
}

interface EmptyStateControllerOptions {
    rootId: string;
    titleId?: string;
    messageId?: string;
    resetButtonId?: string;
    clearButtonId?: string;
    resetEventName?: string;
    clearEventName?: string;
    eventSource?: string;
}

export interface EmptyStateController {
    update(model: EmptyStateViewModel): void;
    dispose(): void;
}

function dispatchEmptyStateEvent(eventName: string, source?: string): void {
    window.dispatchEvent(new CustomEvent(eventName, {
        detail: source ? { source } : undefined,
    }));
}

export function createEmptyStateController(options: EmptyStateControllerOptions): EmptyStateController {
    const elements: EmptyStateElements = {
        root: document.getElementById(options.rootId) as HTMLElement | null,
        title: options.titleId ? document.getElementById(options.titleId) as HTMLElement | null : null,
        message: options.messageId ? document.getElementById(options.messageId) as HTMLElement | null : null,
        resetButton: options.resetButtonId ? document.getElementById(options.resetButtonId) as HTMLButtonElement | null : null,
        clearButton: options.clearButtonId ? document.getElementById(options.clearButtonId) as HTMLButtonElement | null : null,
    };

    const onReset = () => {
        if (options.resetEventName) dispatchEmptyStateEvent(options.resetEventName, options.eventSource);
    };
    const onClear = () => {
        if (options.clearEventName) dispatchEmptyStateEvent(options.clearEventName, options.eventSource);
    };
    if (elements.resetButton && options.resetEventName) elements.resetButton.addEventListener('click', onReset);
    if (elements.clearButton && options.clearEventName) elements.clearButton.addEventListener('click', onClear);

    return {
        update(model: EmptyStateViewModel): void {
            if (!elements.root) return;
            elements.root.hidden = !model.visible;
            elements.root.setAttribute('data-empty-reason', model.visible ? model.reason : '');
            if (elements.title) elements.title.textContent = model.title;
            if (elements.message) elements.message.textContent = model.message;
            if (elements.resetButton) elements.resetButton.hidden = !model.showResetAction;
            if (elements.clearButton) elements.clearButton.hidden = !model.showClearAction;
            if ((!elements.title || !elements.message) && typeof model.fallbackText === 'string') {
                elements.root.textContent = model.fallbackText;
            }
        },

        dispose(): void {
            if (elements.resetButton) elements.resetButton.removeEventListener('click', onReset);
            if (elements.clearButton) elements.clearButton.removeEventListener('click', onClear);
        },
    };
}

export function isRangeOutsideDataset(timeRange: TimeRange | null | undefined, start: unknown, end: unknown): boolean {
    const min = Number(timeRange?.min);
    const max = Number(timeRange?.max);
    const rangeStart = Number(start);
    const rangeEnd = Number(end);
    return Number.isFinite(min)
        && Number.isFinite(max)
        && min < max
        && Number.isFinite(rangeStart)
        && Number.isFinite(rangeEnd)
        && (rangeEnd <= min || rangeStart >= max);
}
