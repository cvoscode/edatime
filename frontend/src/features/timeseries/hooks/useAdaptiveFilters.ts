/**
 * useAdaptiveFilters — manages adaptive line filter creation and display.
 *
 * Adaptive filters are created via Ctrl+Click on the chart.
 * The user draws a line segment; the filter passes points near that line.
 */
import { createSignal } from 'solid-js';
import type { AdaptiveLineFilter } from '@/types/domains';

export interface AdaptiveFilterPoints {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    screenX: number;
    screenY: number;
}

export interface UseAdaptiveFiltersResult {
    /** Points for the popup — set on Ctrl+Click complete */
    adaptiveFilterPoints: () => AdaptiveFilterPoints | null;
    setAdaptiveFilterPoints: (pts: AdaptiveFilterPoints | null) => void;
    /** Whether the popup is visible */
    showAdaptivePopup: () => boolean;
    setShowAdaptivePopup: (show: boolean) => void;
    /** Screen position for popup */
    popupScreenPos: () => { x: number; y: number } | null;
    setPopupScreenPos: (pos: { x: number; y: number } | null) => void;
    /** Pending point (in-progress line, x2/y2 may be null) */
    pendingAdaptivePoint: () => { x1: number; y1: number; x2: number | null; y2: number | null } | null;
    setPendingAdaptivePoint: (pt: { x1: number; y1: number; x2: number | null; y2: number | null } | null) => void;
    /** Active adaptive filters applied to the chart */
    adaptiveLineFilters: () => AdaptiveLineFilter[];
    addAdaptiveFilter: (filter: AdaptiveLineFilter) => void;
    removeAdaptiveFilter: (id: string) => void;
    clearAdaptiveFilters: () => void;
}

export function useAdaptiveFilters(): UseAdaptiveFiltersResult {
    const [adaptiveFilterPoints, setAdaptiveFilterPoints] = createSignal<AdaptiveFilterPoints | null>(null);
    const [showAdaptivePopup, setShowAdaptivePopup] = createSignal(false);
    const [popupScreenPos, setPopupScreenPos] = createSignal<{ x: number; y: number } | null>(null);
    const [pendingAdaptivePoint, setPendingAdaptivePoint] = createSignal<{
        x1: number; y1: number; x2: number | null; y2: number | null;
    } | null>(null);
    const [adaptiveLineFilters, setAdaptiveLineFilters] = createSignal<AdaptiveLineFilter[]>([]);

    const addAdaptiveFilter = (filter: AdaptiveLineFilter) => {
        setAdaptiveLineFilters(prev => [...prev, filter]);
    };

    const removeAdaptiveFilter = (id: string) => {
        setAdaptiveLineFilters(prev => prev.filter(f => f.id !== id));
    };

    const clearAdaptiveFilters = () => {
        setAdaptiveLineFilters([]);
    };

    return {
        adaptiveFilterPoints,
        setAdaptiveFilterPoints,
        showAdaptivePopup,
        setShowAdaptivePopup,
        popupScreenPos,
        setPopupScreenPos,
        pendingAdaptivePoint,
        setPendingAdaptivePoint,
        adaptiveLineFilters,
        addAdaptiveFilter,
        removeAdaptiveFilter,
        clearAdaptiveFilters,
    };
}