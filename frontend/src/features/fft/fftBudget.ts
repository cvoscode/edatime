import { fetchCapabilities, type ApiCapabilities } from '../../services/api/index.js';

export const FFT_TARGET_POINTS = 131_072;
export const FFT_FALLBACK_BUDGET = 65_536;

/** Clamp FFT requests to the server-advertised analytics work budget. */
export function resolveFftPointBudget(
    capabilities: ApiCapabilities | null | undefined,
    target = FFT_TARGET_POINTS,
): number {
    const advertised = Number(capabilities?.budgets?.analytics_points);
    const budget = Number.isFinite(advertised) && advertised > 0
        ? Math.floor(advertised)
        : FFT_FALLBACK_BUDGET;
    return Math.min(target, budget);
}

export async function fetchFftPointBudget(signal?: AbortSignal): Promise<number> {
    try {
        return resolveFftPointBudget(await fetchCapabilities({ signal }));
    } catch (error) {
        if (signal?.aborted) throw error;
        // Older backends may not expose capabilities. The deployed default is
        // deliberately conservative so an FFT still runs instead of failing.
        return FFT_FALLBACK_BUDGET;
    }
}
