export function isWindowsPlatform(): boolean {
    return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export function defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined {
    return undefined;
}

let requestAdapterShimInstalled = false;

export function installWindowsWebGpuRequestAdapterWorkaround(): void {
    if (requestAdapterShimInstalled || !isWindowsPlatform()) return;
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return;

    const gpu = navigator.gpu as GPU & { requestAdapter: (options?: Record<string, unknown>) => Promise<unknown | null> };
    const originalRequestAdapter = gpu.requestAdapter?.bind(gpu);
    if (typeof originalRequestAdapter !== 'function') return;

    const requestAdapter = (options?: Record<string, unknown>) => {
        if (!options || typeof options !== 'object' || !Object.prototype.hasOwnProperty.call(options, 'powerPreference')) {
            return originalRequestAdapter(options);
        }
        const { powerPreference: _ignored, ...rest } = options;
        return Object.keys(rest).length > 0 ? originalRequestAdapter(rest) : originalRequestAdapter();
    };

    Object.defineProperty(gpu, 'requestAdapter', {
        configurable: true,
        value: requestAdapter,
    });
    requestAdapterShimInstalled = true;
}

export async function requestGpuAdapter(): Promise<unknown | null> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return null;
    const powerPreference = defaultGpuPowerPreference();
    if (!powerPreference) return navigator.gpu.requestAdapter();
    return (navigator.gpu.requestAdapter as (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<unknown | null>)({
        powerPreference,
    });
}
