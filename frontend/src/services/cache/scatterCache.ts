// services/cache/scatterCache.ts
// In-memory cache for scatter data

export interface CachedScatterData {
  points: [number, number][];
  colorValues: (number | null)[];
  colorMin: number;
  colorMax: number;
  totalPoints: number;
  returnedPoints: number;
  colorLabels?: (string | null)[];
  x: string;
  y: string;
  colorCol: string | null;
}

export class ScatterCache {
  private _cache: CachedScatterData | null = null;

  clear(): void {
    this._cache = null;
  }

  update(data: CachedScatterData): void {
    this._cache = data;
  }

  get(): CachedScatterData | null {
    return this._cache;
  }

  has(): boolean {
    return this._cache !== null;
  }

  /**
   * Invalidate cache entry if the query params don't match.
   */
  invalidateIfMismatch(x: string, y: string, colorCol: string | null): void {
    if (
      this._cache &&
      (this._cache.x !== x || this._cache.y !== y || this._cache.colorCol !== colorCol)
    ) {
      this.clear();
    }
  }
}

export const scatterCache = new ScatterCache();