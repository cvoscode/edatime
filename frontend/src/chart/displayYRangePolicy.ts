export interface DisplayYRangeInput {
    userMin: number | null;
    userMax: number | null;
    dataMin: number | null;
    dataMax: number | null;
    robustMin: number | null;
    robustMax: number | null;
    stackFromZero: boolean;
}

export function computeDisplayYRange(input: DisplayYRangeInput): { min: number; max: number } | null {
    const hasUserRange = Number.isFinite(input.userMin) && Number.isFinite(input.userMax) && input.userMax! > input.userMin!;
    const baseMin = hasUserRange ? input.userMin : (Number.isFinite(input.robustMin) ? input.robustMin : input.dataMin);
    const baseMax = hasUserRange ? input.userMax : (Number.isFinite(input.robustMax) ? input.robustMax : input.dataMax);
    if (!Number.isFinite(baseMin) || !Number.isFinite(baseMax) || baseMax! <= baseMin!) return null;
    const padding = (baseMax! - baseMin!) * 0.05;
    const stack = input.stackFromZero;
    const nonNegative = stack || (!hasUserRange && baseMin! >= 0 && (input.dataMin ?? baseMin!) >= 0);
    return {
        min: nonNegative ? Math.max(0, (stack ? Math.max(0, baseMin!) : baseMin! - padding)) : baseMin! - padding,
        max: baseMax! + padding,
    };
}
