import type { DataObject, FetchedWindow, YMode } from '../types.js';
import { emitStoreEvent } from './events.js';

export interface RuntimeState {
    lastFetchedData: DataObject | null;
    fetchedWindow: FetchedWindow | null;
    fetchDebounceId: ReturnType<typeof setTimeout> | null;
    pendingYMode: YMode | null;
    pendingRestoreY: { min: number; max: number } | null;
    analysisBound: boolean;
    refetchOnZoom: boolean;
}

export const runtimeState: RuntimeState = {
    lastFetchedData: null,
    fetchedWindow: null,
    fetchDebounceId: null,
    pendingYMode: 'fit',
    pendingRestoreY: null,
    analysisBound: false,
    refetchOnZoom: true,
};

export function setLastFetchedData(data: DataObject | null): void {
    const previous = runtimeState.lastFetchedData;
    runtimeState.lastFetchedData = data;
    emitStoreEvent('runtime:lastFetchedData', { previous, next: data });
}

export function setFetchedWindow(window: FetchedWindow | null): void {
    const previous = runtimeState.fetchedWindow;
    runtimeState.fetchedWindow = window ? { ...window } : null;
    emitStoreEvent('runtime:fetchedWindow', { previous, next: runtimeState.fetchedWindow });
}

export function setFetchDebounceId(id: ReturnType<typeof setTimeout> | null): void {
    const previous = runtimeState.fetchDebounceId;
    runtimeState.fetchDebounceId = id;
    emitStoreEvent('runtime:fetchDebounceId', { previous, next: id });
}

export function setPendingYMode(mode: YMode | null): void {
    const previous = runtimeState.pendingYMode;
    runtimeState.pendingYMode = mode;
    emitStoreEvent('runtime:pendingYMode', { previous, next: mode });
}

export function setPendingRestoreY(range: { min: number; max: number } | null): void {
    const previous = runtimeState.pendingRestoreY;
    runtimeState.pendingRestoreY = range ? { ...range } : null;
    emitStoreEvent('runtime:pendingRestoreY', { previous, next: runtimeState.pendingRestoreY });
}

export function setAnalysisBound(bound: boolean): void {
    const previous = runtimeState.analysisBound;
    runtimeState.analysisBound = bound;
    emitStoreEvent('runtime:analysisBound', { previous, next: bound });
}

export function setRefetchOnZoom(refetch: boolean): void {
    const previous = runtimeState.refetchOnZoom;
    runtimeState.refetchOnZoom = refetch;
    emitStoreEvent('runtime:refetchOnZoom', { previous, next: refetch });
}
