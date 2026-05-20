/**
 * domain/timeseries/constants.ts
 * Constants for the timeseries domain.
 */
import type { ChartViewport } from '../../types';

export const DEFAULT_VIEWPORT: ChartViewport = {
  xMin: 0,
  xMax: 100,
  yMin: 0,
  yMax: 1,
};

export const MAX_ZOOM_STACK = 50;
export const ZOOM_FACTOR = 0.8;
export const VIEWPORT_DEBOUNCE_MS = 150;
export const COLOR_UPDATE_DEBOUNCE_MS = 50;
export const DOUBLE_CONTEXT_MENU_THRESHOLD_MS = 450;