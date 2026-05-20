// services/cache/timeseriesCache.ts
// In-memory cache for timeseries data

export class TimeseriesCache {
  xValues: Float64Array | null = null;
  series: Record<string, Float64Array> | null = null;
  revision: number | null = null;

  clear(): void {
    this.xValues = null;
    this.series = null;
    this.revision = null;
  }

  update(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    revision?: number
  ): void {
    this.xValues = xValues;
    this.series = series;
    if (revision !== undefined) {
      this.revision = revision;
    }
  }

  get(): { xValues: Float64Array; series: Record<string, Float64Array> } | null {
    if (!this.xValues || !this.series) return null;
    return { xValues: this.xValues, series: this.series };
  }

  has(): boolean {
    return this.xValues !== null && this.series !== null;
  }
}

export const timeseriesCache = new TimeseriesCache();