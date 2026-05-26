import { describe, expect, it } from 'vitest';
import { buildSeriesConfig } from './dataFetch';

describe('buildSeriesConfig', () => {
  it('colors series by an aligned color column without stale length assumptions', () => {
    const config = buildSeriesConfig(
      Float64Array.from([1, 2, 3, 4]),
      {
        MUFL: Float64Array.from([10, NaN, 12, 13]),
        MULL: Float64Array.from([20, 21, 22, 23]),
      },
      { MUFL: '#111111', MULL: '#222222' },
      {},
      { OT: Float64Array.from([0.1, 0.2, 0.3, 0.4]) },
      'OT',
      false,
      'viridis'
    );

    expect(config.length).toBeGreaterThan(2);
    expect(config.every((series) => Array.isArray(series.data))).toBe(true);
    expect(config.some((series) => series.name.startsWith('__color_seg__') || series.lineStyle?.color)).toBe(true);
  });

  it('keeps color values aligned after numeric filters', () => {
    const config = buildSeriesConfig(
      Float64Array.from([1, 2, 3, 4]),
      {
        MUFL: Float64Array.from([10, 11, 12, 13]),
      },
      { MUFL: '#111111' },
      { MUFL: { min: 11, max: 13 } },
      { OT: Float64Array.from([0.1, 0.2, 0.3, 0.4]) },
      'OT',
      false,
      'viridis'
    );

    const totalPoints = config.reduce((count, series) => count + series.data.length, 0);
    expect(totalPoints).toBeGreaterThan(0);
    expect(config.every((series) => series.data.every((point: [number, number]) => point[0] >= 2))).toBe(true);
  });
});
