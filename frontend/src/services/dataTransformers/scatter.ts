// services/dataTransformers/scatter.ts
// Pure scatter data transformation functions — NO SolidJS imports

import type { ColorScaleInfo } from './timeseries';

export interface ScatterChartData {
  points: [number, number][];
  colorValues: (number | null)[];
  colorMin: number;
  colorMax: number;
  totalPoints: number;
  returnedPoints: number;
  colorLabels?: (string | null)[];
}

const DEFAULT_MAX_POINTS = 500000;
const EPSILON = 1e-9;

// =============================================================================
// Scatter response transformation
// =============================================================================

export interface ScatterPointsResponse {
  status: 'ok';
  x: string;
  y: string;
  color: string | null;
  total_points: number;
  returned_points: number;
  points: [number, number][];
  color_values: number[] | null;
  color_labels: (string | null)[] | null;
  color_min: number | null;
  color_max: number | null;
  size_values: number[] | null;
  size_min: number | null;
  size_max: number | null;
}

/**
 * Transform a scatter points JSON response into chart-ready data.
 * Filters out non-finite points, handles missing color values.
 */
export function transformScatterResponse(
  json: ScatterPointsResponse,
  _colorCol: string
): ScatterChartData {
  const { points, color_values, color_min, color_max } = json;

  // Validate and filter points where x or y is not finite
  const validPoints: [number, number][] = [];
  const processedColorValues: (number | null)[] = [];

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    validPoints.push([x, y]);

    if (color_values !== null) {
      const cv = color_values[i];
      processedColorValues.push(Number.isFinite(cv) ? cv : null);
    }
  }

  // Handle color range normalization — avoid degenerate scale when min === max
  let normalizedColorMin = color_min ?? 0;
  let normalizedColorMax = color_max ?? 0;
  if (normalizedColorMin === normalizedColorMax) {
    normalizedColorMin -= EPSILON;
    normalizedColorMax += EPSILON;
  }

  const returnedPoints = Math.min(validPoints.length, DEFAULT_MAX_POINTS);
  const finalPoints = validPoints.slice(0, returnedPoints);
  const finalColorValues = processedColorValues.slice(0, returnedPoints);

  return {
    points: finalPoints,
    colorValues: finalColorValues,
    colorMin: normalizedColorMin,
    colorMax: normalizedColorMax,
    totalPoints: validPoints.length,
    returnedPoints,
    colorLabels: json.color_labels?.slice(0, returnedPoints) ?? undefined,
  };
}

// =============================================================================
// Color scale analysis
// =============================================================================

/**
 * Analyze color values to determine if numeric or categorical.
 * Returns ColorScaleInfo for downstream color mapping.
 */
export function analyzeColorValues(values: unknown[]): ColorScaleInfo | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  let numericCount = 0;
  let nonNumericCount = 0;
  const uniqueValues = new Set<string>();
  const sampleSize = Math.min(values.length, 1000);

  for (let i = 0; i < sampleSize; i++) {
    const raw = values[i];
    if (raw == null) continue;
    uniqueValues.add(String(raw));
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) numericCount += 1;
    else nonNumericCount += 1;
  }

  const isNumeric = numericCount > 0 && nonNumericCount === 0;
  if (isNumeric) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of values) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { isNumeric: true, min, max, categories: [] };
  }

  const categories: string[] = [];
  for (const v of uniqueValues) categories.push(v);
  return { isNumeric: false, min: null, max: null, categories };
}

// =============================================================================
// Categorical color mapping
// =============================================================================

/**
 * Build a color mapping for categorical (string) color columns.
 * Returns a Map from category label -> color string.
 */
export function buildColorGroups(categories: string[]): Map<string, string> {
  const map = new Map<string, string>();
  // Use viridis palette — enough buckets for any practical number of categories
  const COLOR_BUCKETS = 64;
  const palette = getViridisPalette(COLOR_BUCKETS);
  for (let i = 0; i < categories.length; i++) {
    const idx = i % palette.length;
    map.set(categories[i], palette[idx]);
  }
  return map;
}

// Simple viridis approximation for color bucketing (no external dependency)
function getViridisPalette(n: number): string[] {
  // Approximate viridis color scale at n buckets
  const viridis = [
    [68, 1, 84], [73, 17, 99], [77, 34, 110], [81, 49, 119],
    [84, 64, 127], [87, 79, 133], [90, 93, 139], [93, 107, 144],
    [96, 121, 148], [99, 135, 152], [101, 148, 155], [104, 161, 158],
    [107, 174, 161], [110, 186, 163], [113, 198, 165], [116, 211, 167],
    [119, 223, 169], [122, 234, 170], [126, 246, 171], [129, 255, 172],
    [133, 255, 174], [138, 255, 176], [142, 255, 177], [147, 255, 178],
    [152, 255, 179], [157, 255, 179], [162, 255, 180], [167, 255, 180],
    [172, 255, 181], [177, 255, 181], [183, 255, 181], [188, 255, 182],
    [193, 255, 182], [199, 255, 182], [204, 255, 182], [210, 255, 182],
    [215, 255, 182], [221, 255, 182], [227, 255, 181], [232, 255, 181],
    [238, 255, 181], [243, 255, 180], [249, 255, 180], [254, 255, 179],
  ];
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1);
    const idx = Math.min(Math.floor(t * (viridis.length - 1)), viridis.length - 1);
    const [r, g, b] = viridis[idx];
    result.push(`rgb(${r},${g},${b})`);
  }
  return result;
}