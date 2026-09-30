# ai/frontend/src/utils/platform.md

> Platform detection and WebGPU adapter initialization helpers, including a Windows-specific workaround.

## Functions
- `isWindowsPlatform(): boolean`
  - Returns true if `navigator.userAgent` matches Windows.
- `defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined`
  - Returns the default GPU power preference.
- `stripIgnoredPowerPreference(options?: Record<string, unknown>): Record<string, unknown> | undefined`
  - Removes `powerPreference` from GPU adapter options when it should be ignored.
- `installWindowsWebGpuRequestAdapterWorkaround(): void`
  - Patches `navigator.gpu.requestAdapter` on Windows to strip problematic power preference.
- `requestGpuAdapter(): Promise<unknown | null>`
  - Requests a WebGPU adapter using the platform-appropriate options.