interface SpectrogramErrorLike {
    code?: unknown;
    message?: unknown;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as SpectrogramErrorLike).message ?? error);
    }
    return String(error);
}

/** Turn server work-budget failures into guidance tied to an actual UI control. */
export function describeSpectrogramFailure(error: unknown): string {
    const message = errorMessage(error);
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as SpectrogramErrorLike).code ?? '')
        : '';
    const isWorkBudgetFailure = code === 'work_budget_exceeded' || message.includes('work_budget_exceeded');

    if (isWorkBudgetFailure && message.includes('spectrogram input points')) {
        return 'This spectrogram exceeds the server\'s input budget. In Settings → Analytics, choose a lower Spectrogram sample limit, then update the spectrogram.';
    }
    if (isWorkBudgetFailure && message.includes('spectrogram output cells')) {
        return 'This spectrogram would create too many cells. Increase Hop (choose 50% or 75% instead of a small Custom value), then update the spectrogram. If needed, also narrow the time range.';
    }
    if (isWorkBudgetFailure) {
        return 'This spectrogram is too large to compute. Lower the Spectrogram sample limit in Settings → Analytics, or increase Hop, then try again.';
    }
    return `Spectrogram generation failed: ${message}`;
}
