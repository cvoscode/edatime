const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }
  const promise = factory().finally(() => {
    inflight.delete(key);
  }) as Promise<T>;
  inflight.set(key, promise);
  return promise;
}

export function buildRenderSignature(controls: {
  x?: string;
  y?: string;
  renderMode?: string;
  colorColumn?: string;
  colorScale?: string;
}): string {
  return [
    controls.x || '',
    controls.y || '',
    controls.renderMode || '',
    controls.colorColumn || '',
    controls.colorScale || '',
  ].join('|');
}

let lastRenderSignature = '';

export function shouldRerender(signature: string): boolean {
  if (signature === lastRenderSignature) {
    return false;
  }
  lastRenderSignature = signature;
  return true;
}

export function resetRenderSignature(): void {
  lastRenderSignature = '';
}