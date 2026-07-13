import { emitStoreEvent } from './events.js';

export interface RuntimeState {
    analysisBound: boolean;
}

export const runtimeState: RuntimeState = {
    analysisBound: false,
};

export function setAnalysisBound(bound: boolean): void {
    const previous = runtimeState.analysisBound;
    runtimeState.analysisBound = bound;
    emitStoreEvent('runtime:analysisBound', { previous, next: bound });
}
