// Mock solid-js/web to prevent "Client-only API" errors from server build in jsdom
vi.mock('solid-js/web', async () => {
  const actual = await import('solid-js/web');
  return { ...actual, isServer: false };
});