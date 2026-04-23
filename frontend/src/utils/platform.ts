export function isWindowsPlatform(): boolean {
    return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export function defaultGpuPowerPreference(): 'low-power' | 'high-performance' | undefined {
    return isWindowsPlatform() ? 'low-power' : undefined;
}
