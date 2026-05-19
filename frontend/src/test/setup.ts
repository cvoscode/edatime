/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks must be before any SolidJS / router imports
// ---------------------------------------------------------------------------

// Prevent solid-js/web server module from leaking into client-only tests.
// The @solidjs/router package internally imports 'solid-js/web' for SSR.
// Mocking it here ensures the client version is used in tests.
vi.mock('solid-js/web', () => {
  const actual = vi.importActual('solid-js/web');
  return actual ?? {
    template: () => ({ get HTML() { return document.createElement('template'); } }),
    insert: vi.fn(),
    createComponent: vi.fn(),
    mergeProps: vi.fn(),
    delegateEvents: vi.fn(),
  };
});

// Mock solid-js/web before it gets imported by @solidjs/router in tests.
// @solidjs/router imports solid-js/web for SSR event delegation, which fails in
// jsdom (browser) test environment. Mocking it ensures the client build is used.
vi.mock('solid-js/web', () => {
  // Use vi.importActual to get real implementations where they work in jsdom
  try {
    const actual = vi.importActual('solid-js/web');
    if (actual && typeof actual === 'object') {
      return {
        ...actual as object,
        delegateEvents: vi.fn(),
      };
    }
  } catch { /* fall through to fallback */ }
  // Minimal fallback — enough for the template() calls in router internals
  return {
    template: () => ({ outerHTML: '<template></template>', cloneNode: vi.fn() }),
    insert: vi.fn(),
    createComponent: vi.fn(),
    mergeProps: vi.fn(),
    delegateEvents: vi.fn(),
    get owner() { return null; },
  };
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock ResizeObserver - create functions separately so they survive clearAllMocks
const roObserve = vi.fn();
const roUnobserve = vi.fn();
const roDisconnect = vi.fn();
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: roObserve,
  unobserve: roUnobserve,
  disconnect: roDisconnect,
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(_query => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Reset localStorage mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReset();
  localStorageMock.setItem.mockReset();
});