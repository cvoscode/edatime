// services/api/client.ts
// Pure fetch functions — NO SolidJS imports
// Request deduplication using Maps for concurrent identical requests

const API_BASE = '/api';

// Request deduplication for concurrent identical GET requests
export const _inflightJson = new Map<string, Promise<unknown>>();
export const _inflightArrow = new Map<string, Promise<Response>>();

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const existing = _inflightJson.get(url);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = (async () => {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${url} failed (${res.status}) ${text}`);
    }
    return res.json() as T;
  })();
  _inflightJson.set(url, promise);
  try {
    return await promise;
  } finally {
    _inflightJson.delete(url);
  }
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json() as T;
}

// Request deduplication for Arrow IPC responses
export async function fetchArrow(url: string, signal?: AbortSignal): Promise<Response> {
  const existing = _inflightArrow.get(url);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${url} failed (${res.status}) ${text}`);
    }
    return res;
  })();
  _inflightArrow.set(url, promise);
  try {
    return await promise;
  } finally {
    _inflightArrow.delete(url);
  }
}

// Helper to build full URL with optional query params
export function buildUrl(path: string, params?: Record<string, string | number | undefined | null>): string {
  const url = `${API_BASE}${path}`;
  if (!params) return url;
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      searchParams.set(k, String(v));
    }
  }
  const qs = searchParams.toString();
  return qs ? `${url}?${qs}` : url;
}