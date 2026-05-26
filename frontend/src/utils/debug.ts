const DEBUG = import.meta.env.VITE_EDATIME_DEBUG === 'true';

if (typeof console !== 'undefined' && !DEBUG) {
  console.debug = () => {};
}

export function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.debug(...args);
  }
}

export function debugLogOnce(key: string, ...args: unknown[]): void {
  if (DEBUG) {
    if (!_loggedKeys.has(key)) {
      _loggedKeys.add(key);
      console.debug(...args);
    }
  }
}

const _loggedKeys = new Set<string>();

export function resetDebugLogs(): void {
  _loggedKeys.clear();
}
