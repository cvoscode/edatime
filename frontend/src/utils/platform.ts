export function isWindowsPlatform(): boolean {
    return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export function defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined {
    return isWindowsPlatform() ? 'low-power' : undefined;
}

export async function requestGpuAdapter(): Promise<unknown | null> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return null;
    const powerPreference = defaultGpuPowerPreference();
    if (!powerPreference) return navigator.gpu.requestAdapter();
    return (navigator.gpu.requestAdapter as (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<unknown | null>)({
        powerPreference,
    });
}
