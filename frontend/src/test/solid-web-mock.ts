// Prevent SSR-only solid-js/web APIs from failing in jsdom test environment.
// 'solid-js/web' normally resolves to dist/server.js in Node.js, which throws
// notSup() when template() is called. This mock intercepts that call.
// IMPORTANT: Import this module BEFORE any @solidjs/router imports in test files.
import { vi } from 'vitest';

vi.mock('solid-js/web', () => ({
  template: vi.fn(() => ({})),
  isServer: false,
  getRequestEvent: vi.fn(),
  createComponent: vi.fn(),
  memo: vi.fn(),
  delegateEvents: vi.fn(),
  spread: vi.fn(),
  mergeProps: vi.fn(),
  Show: vi.fn(),
  For: vi.fn(),
  Dynamic: vi.fn(),
  Suspense: vi.fn(),
  SuspenseList: vi.fn(),
  ErrorBoundary: vi.fn(),
  Portal: vi.fn(),
  HydrationScript: vi.fn(),
  NoHydration: vi.fn(),
  client: { isServer: false },
  server: { isServer: true },
}));