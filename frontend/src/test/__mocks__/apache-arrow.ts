import { vi } from 'vitest';

// Mock for apache-arrow in jsdom test environment
// The actual module has tableFromIPC as both named and default export
const mockTableFromIPC = vi.fn().mockReturnValue({
  schema: { fields: [] },
  numRows: 0,
  getChild: vi.fn().mockReturnValue(null),
});

export const tableFromIPC = mockTableFromIPC;
export default { tableFromIPC: mockTableFromIPC };