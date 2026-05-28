# platform.ts

Platform detection and WebGPU adapter utilities.

## Functions

```typescript
function isWindowsPlatform(): boolean
```

Check if running on Windows.

```typescript
function defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined
```

Get default GPU power preference.

```typescript
function stripIgnoredPowerPreference(options?: Record<string, unknown>): Record<string, unknown> | undefined
```

Remove powerPreference from WebGPU adapter options (Windows workaround).

```typescript
function installWindowsWebGpuRequestAdapterWorkaround(): void
```

Install Windows WebGPU requestAdapter shim to strip powerPreference.

```typescript
async function requestGpuAdapter(): Promise<unknown | null
```

Request WebGPU adapter with platform-specific handling.