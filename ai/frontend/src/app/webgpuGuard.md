# frontend/src/app/webgpuGuard.ts
> WebGPU adapter availability check and fatal error rendering.

## Functions

### checkWebGPU
- `checkWebGPU(): Promise<string | null>`
  - Returns `null` if WebGPU is available with a valid adapter; returns an error message string otherwise (unsupported browser, no adapter, timeout, or request failure).

### showFatalError
- `showFatalError(containerId: string, message: string): void`
  - Replaces the target container's children with a centered error message div.

---
[1]: ../utils/platform.md
