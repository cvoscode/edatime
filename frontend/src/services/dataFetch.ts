import { tableFromIPC } from 'apache-arrow';

export interface TimeseriesData {
  xValues: Float64Array;
  series: Record<string, Float64Array>;
  returnedRows: number;
  downsampled: boolean;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
  const abs = Math.abs(numericValue);
  if (abs >= 1e17) return numericValue / 1e6;
  if (abs >= 1e14) return numericValue / 1e3;
  if (abs >= 1e11) return numericValue;
  return numericValue * 1e3;
}

export async function fetchTimeseriesData(
  start: string,
  end: string,
  width: number,
  xAxisColumn: string,
  traceColumns: string[]
): Promise<TimeseriesData> {
  const allColumns = [xAxisColumn, ...traceColumns];
  const params = new URLSearchParams({
    start,
    end,
    width: String(width),
    columns: allColumns.join(','),
  });

  const res = await fetch(`/api/data?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchTimeseriesData failed: ${res.status}`);

  const buffer = await res.arrayBuffer();
  const table = tableFromIPC(buffer);

  const xCol = table.getChild(xAxisColumn);
  const xValues = Float64Array.from(
    xCol ? Array.from(xCol) : [],
    v => toEpochMs(v)
  );

  const series: Record<string, Float64Array> = {};
  for (const col of traceColumns) {
    const c = table.getChild(col);
    if (c) {
      series[col] = Float64Array.from(Array.from(c), v => Number(v));
    }
  }

  return {
    xValues,
    series,
    returnedRows: table.numRows,
    downsampled: res.headers.get('x-edatime-downsampled') === '1',
  };
}

export function buildSeriesConfig(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  colors: Record<string, string>
): any[] {
  return Object.entries(series).map(([colName, yValues]) => {
    const points: [number, number][] = [];
    for (let i = 0; i < Math.min(xValues.length, yValues.length); i++) {
      const x = xValues[i];
      const y = yValues[i];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push([x, y]);
      }
    }
    return {
      type: 'line',
      name: colName,
      color: colors[colName] ?? '#5470C6',
      visible: true,
      data: points,
    };
  });
}