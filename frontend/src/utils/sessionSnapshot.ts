/**
 * Session snapshot shape and validation. DOM-free so it can be unit-tested.
 *
 * A snapshot comes from localStorage or a user-chosen file, so it is untrusted:
 * `parseSessionSnapshot` keeps only well-typed fields. A dropped field means
 * "keep the current value" to `applySession`, which is the same as a field that
 * was never saved.
 */

export interface AdaptiveLineFilterSnapshot {
    id?: string;
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

/** The serialisable subset of the focused frontend store. */
export interface SessionSnapshot {
    version: 1;
    timestamp: number;
    page: string;
    selectedCols: string[];
    seriesColors: Record<string, string>;
    columnRanges: Record<string, { from: number; to: number }>;
    adaptiveLineFilters: AdaptiveLineFilterSnapshot[];
    currentStart: number | null;
    currentEnd: number | null;
    selectedColorColumn: string | null;
    chartText: { title: string; xLabel: string; yLabel: string };
    rollingEnabled: boolean;
    rollingWindow: number;
    rollingDisplayMode?: 'raw' | 'smooth' | 'both';
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    scatterX: string;
    scatterY: string;
    scatterColorColumn: string;
    scatterRenderMode: string;
    datasetRevision?: number;
}

/** A snapshot whose fields other than `version` may be absent (older or hand-edited files). */
export type SessionInput = Pick<SessionSnapshot, 'version'> & Partial<SessionSnapshot>;

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';

function stringMap(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => isString(entry[1])));
}

function rangeMap(value: unknown): SessionSnapshot['columnRanges'] | undefined {
    if (!isRecord(value)) return undefined;
    const ranges: SessionSnapshot['columnRanges'] = {};
    for (const [column, range] of Object.entries(value)) {
        if (isRecord(range) && isFiniteNumber(range.from) && isFiniteNumber(range.to)) {
            ranges[column] = { from: range.from, to: range.to };
        }
    }
    return ranges;
}

function adaptiveLines(value: unknown): AdaptiveLineFilterSnapshot[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.flatMap((item): AdaptiveLineFilterSnapshot[] => {
        if (!isRecord(item) || !isString(item.column) || typeof item.keepAbove !== 'boolean'
            || !isFiniteNumber(item.x1) || !isFiniteNumber(item.y1) || !isFiniteNumber(item.x2) || !isFiniteNumber(item.y2)) {
            return [];
        }
        return [{
            ...(isString(item.id) ? { id: item.id } : {}),
            column: item.column, x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, keepAbove: item.keepAbove,
        }];
    });
}

function chartText(value: unknown): SessionSnapshot['chartText'] | undefined {
    if (!isRecord(value)) return undefined;
    return {
        title: isString(value.title) ? value.title : '',
        xLabel: isString(value.xLabel) ? value.xLabel : '',
        yLabel: isString(value.yLabel) ? value.yLabel : '',
    };
}

/** Validate untrusted JSON. Returns null unless it is a version-1 snapshot object. */
export function parseSessionSnapshot(raw: unknown): SessionInput | null {
    if (!isRecord(raw) || raw.version !== 1) return null;
    const displayMode = raw.rollingDisplayMode;
    const parsed: Partial<SessionSnapshot> = {
        timestamp: isFiniteNumber(raw.timestamp) ? raw.timestamp : undefined,
        page: isString(raw.page) ? raw.page : undefined,
        selectedCols: Array.isArray(raw.selectedCols) ? raw.selectedCols.filter(isString) : undefined,
        seriesColors: stringMap(raw.seriesColors),
        columnRanges: rangeMap(raw.columnRanges),
        adaptiveLineFilters: adaptiveLines(raw.adaptiveLineFilters),
        currentStart: raw.currentStart === null || isFiniteNumber(raw.currentStart) ? raw.currentStart : undefined,
        currentEnd: raw.currentEnd === null || isFiniteNumber(raw.currentEnd) ? raw.currentEnd : undefined,
        selectedColorColumn: raw.selectedColorColumn === null || isString(raw.selectedColorColumn) ? raw.selectedColorColumn : undefined,
        chartText: chartText(raw.chartText),
        rollingEnabled: typeof raw.rollingEnabled === 'boolean' ? raw.rollingEnabled : undefined,
        rollingWindow: isFiniteNumber(raw.rollingWindow) && raw.rollingWindow > 0 ? raw.rollingWindow : undefined,
        rollingDisplayMode: displayMode === 'raw' || displayMode === 'smooth' || displayMode === 'both' ? displayMode : undefined,
        anomalyEnabled: typeof raw.anomalyEnabled === 'boolean' ? raw.anomalyEnabled : undefined,
        anomalyMethod: isString(raw.anomalyMethod) ? raw.anomalyMethod : undefined,
        anomalyThreshold: isFiniteNumber(raw.anomalyThreshold) ? raw.anomalyThreshold : undefined,
        scatterX: isString(raw.scatterX) ? raw.scatterX : undefined,
        scatterY: isString(raw.scatterY) ? raw.scatterY : undefined,
        scatterColorColumn: isString(raw.scatterColorColumn) ? raw.scatterColorColumn : undefined,
        scatterRenderMode: isString(raw.scatterRenderMode) ? raw.scatterRenderMode : undefined,
        datasetRevision: isFiniteNumber(raw.datasetRevision) ? raw.datasetRevision : undefined,
    };
    // Omit rejected fields entirely so `field !== undefined` checks in applySession stay meaningful.
    const kept = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
    return { ...kept, version: 1 };
}
