export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadString(text: string, filename: string, mimeType = 'text/csv'): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  downloadBlob(blob, filename);
}

export function exportChartAsPNG(chartInstance: any, filename = 'edatime_chart.png'): void {
  if (!chartInstance) return;
  const canvas = chartInstance.getCanvas?.() ?? chartInstance.renderer?.canvas;
  if (canvas) {
    downloadUrl(canvas.toDataURL('image/png'), filename);
  }
}

export function exportChartAsCSV(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  filename = 'edatime_data.csv'
): void {
  const cols = Object.keys(series);
  const header = ['timestamp', ...cols].join(',');
  const rows: string[] = [header];
  const len = xValues.length;
  for (let i = 0; i < len; i++) {
    const x = new Date(xValues[i]).toISOString();
    const values = cols.map(c => {
      const v = series[c]?.[i];
      return v !== undefined ? String(v) : '';
    });
    rows.push([x, ...values].join(','));
  }
  downloadString(rows.join('\n'), filename, 'text/csv');
}

export function exportChartAsSVG(chartInstance: any, filename = 'edatime_chart.svg'): void {
  if (!chartInstance) return;
  const svg = chartInstance.exportSVG?.();
  if (svg) {
    downloadString(svg, filename, 'image/svg+xml');
  }
}

export function exportChartAsJSON(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  filename = 'edatime_data.json'
): void {
  const cols = Object.keys(series);
  const rows: object[] = [];
  const len = xValues.length;
  for (let i = 0; i < len; i++) {
    const row: Record<string, number | string> = { timestamp: xValues[i] };
    for (const c of cols) {
      row[c] = series[c]?.[i] ?? null;
    }
    rows.push(row);
  }
  downloadString(JSON.stringify(rows, null, 2), filename, 'application/json');
}