export interface ProcessedScatter {
  points: [number, number][];
  colorValues: (number | null)[];
  colorMin: number;
  colorMax: number;
  totalPoints: number;
  returnedPoints: number;
}

export interface BuildScatterOptions {
  maxPoints?: number;
}

const DEFAULT_MAX_POINTS = 500000;
const EPSILON = 1e-9;

/**
 * Validate and filter points — discard entries where x or y is not finite.
 * Handle color values — if any value is non-finite, replace with null and track as "missing".
 * Normalize color range — if colorMin === colorMax, add small epsilon to avoid degenerate scale.
 */
export function buildScatterData(
  points: [number, number][],
  colorValues: number[] | null,
  colorMin: number,
  colorMax: number,
  options?: BuildScatterOptions
): ProcessedScatter {
  const maxPoints = options?.maxPoints ?? DEFAULT_MAX_POINTS;

  // Validate and filter points where x or y is not finite
  const validPoints: [number, number][] = [];
  const processedColorValues: (number | null)[] = [];

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    validPoints.push([x, y]);

    if (colorValues !== null) {
      const cv = colorValues[i];
      processedColorValues.push(Number.isFinite(cv) ? cv : null);
    }
  }

  // Handle color range normalization — avoid degenerate scale when min === max
  let normalizedColorMin = colorMin;
  let normalizedColorMax = colorMax;
  if (normalizedColorMin === normalizedColorMax) {
    normalizedColorMin -= EPSILON;
    normalizedColorMax += EPSILON;
  }

  // Apply maxPoints limit if needed
  const returnedPoints = Math.min(validPoints.length, maxPoints);
  const finalPoints = validPoints.slice(0, returnedPoints);
  const finalColorValues = processedColorValues.slice(0, returnedPoints);

  return {
    points: finalPoints,
    colorValues: finalColorValues,
    colorMin: normalizedColorMin,
    colorMax: normalizedColorMax,
    totalPoints: validPoints.length,
    returnedPoints,
  };
}