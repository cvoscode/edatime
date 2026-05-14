import { tableFromIPC } from 'apache-arrow';

export interface ScatterWorkerInput {
  buffer: ArrayBuffer;
  hasColor: boolean;
}

self.onmessage = (e: MessageEvent<ScatterWorkerInput>) => {
  const { buffer, hasColor } = e.data;

  const table = tableFromIPC(buffer);

  const xCol = table.getChild('x');
  const yCol = table.getChild('y');
  const colorCol = hasColor ? table.getChild('color_value') : null;

  if (!xCol || !yCol) {
    self.postMessage({ error: 'Arrow table missing required x/y columns' });
    return;
  }

  const points: [number, number][] = [];
  const colorValues: number[] | null = colorCol ? [] : null;

  for (let i = 0; i < table.numRows; i++) {
    const xv = Number(xCol.get(i));
    const yv = Number(yCol.get(i));
    if (Number.isFinite(xv) && Number.isFinite(yv)) {
      points.push([xv, yv]);
      if (colorValues) {
        colorValues.push(Number(colorCol.get(i)));
      }
    }
  }

  const n = points.length;
  const pointsFlat = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    pointsFlat[i * 2] = points[i][0];
    pointsFlat[i * 2 + 1] = points[i][1];
  }

  const colorValuesFlat = colorValues ? new Float64Array(colorValues) : null;

  const transferables: Transferable[] = [pointsFlat.buffer];
  if (colorValuesFlat) {
    transferables.push(colorValuesFlat.buffer);
  }

  self.postMessage(
    {
      points: pointsFlat,
      colorValues: colorValuesFlat,
      length: n
    },
    transferables
  );
};