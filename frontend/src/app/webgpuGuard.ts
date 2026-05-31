/**
 * WebGPU guard — adapter availability check and fatal error rendering.
 * Consumed by app.ts at startup.
 */

import { requestGpuAdapter, installWindowsWebGpuRequestAdapterWorkaround } from '../utils/platform.js';

export async function checkWebGPU(): Promise<string | null> {
    if (!navigator.gpu) {
        return 'WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.';
    }
    try {
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('requestAdapter timed out')), 5000),
        );
        const adapter = await Promise.race([requestGpuAdapter(), timeout]);
        if (!adapter) {
            return 'No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.';
        }
        installWindowsWebGpuRequestAdapterWorkaround();
        return null;
    } catch (e: unknown) {
        const message = (e as Error).message ?? 'Unknown error';
        return `WebGPU adapter request failed: ${message}`;
    }
}

export function showFatalError(containerId: string, message: string): void {
    const container = document.getElementById(containerId);
    if (container) {
        const div = document.createElement('div');
        div.style.cssText =
            'display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;';
        div.textContent = message;
        container.replaceChildren(div);
    }
}