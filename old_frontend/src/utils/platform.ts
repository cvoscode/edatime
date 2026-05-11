export function isWindowsPlatform(): boolean {
    return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export function defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined {
    return undefined;
}

let requestAdapterShimInstalled = false;

type GpuRequestAdapter = (options?: Record<string, unknown>) => Promise<unknown | null>;

interface RequestAdapterGpu {
    requestAdapter: GpuRequestAdapter;
}

function getRequestAdapterGpu(): RequestAdapterGpu | null {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return null;
    return navigator.gpu as RequestAdapterGpu;
}

export function stripIgnoredPowerPreference(options?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!options || typeof options !== 'object' || !Object.prototype.hasOwnProperty.call(options, 'powerPreference')) {
        return options;
    }

    const { powerPreference: _ignored, ...rest } = options;
    return Object.keys(rest).length > 0 ? rest : undefined;
}

export function installWindowsWebGpuRequestAdapterWorkaround(): void {
    if (requestAdapterShimInstalled || !isWindowsPlatform()) return;
    const gpu = getRequestAdapterGpu();
    if (!gpu) return;

    const originalRequestAdapter = gpu.requestAdapter?.bind(gpu);
    if (typeof originalRequestAdapter !== 'function') return;

    const requestAdapter = (options?: Record<string, unknown>) => {
        const sanitizedOptions = stripIgnoredPowerPreference(options);
        return sanitizedOptions ? originalRequestAdapter(sanitizedOptions) : originalRequestAdapter();
    };

    Object.defineProperty(gpu, 'requestAdapter', {
        configurable: true,
        value: requestAdapter,
    });
    requestAdapterShimInstalled = true;
}

export async function requestGpuAdapter(): Promise<unknown | null> {
    const gpu = getRequestAdapterGpu();
    if (!gpu) return null;
    const powerPreference = defaultGpuPowerPreference();
    if (!powerPreference) return gpu.requestAdapter();
    return gpu.requestAdapter({
        powerPreference,
    });
}
