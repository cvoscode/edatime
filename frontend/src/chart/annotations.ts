/**
 * Annotation management system for EdaTime.
 *
 * Supports named notes tied to time ranges, chart callouts,
 * and persistence across sessions.
 */

export type AnnotationType = 'note' | 'callout' | 'region' | 'line' | 'bookmark';

export interface Annotation {
    /** Unique identifier */
    id: string;
    /** Type of annotation */
    type: AnnotationType;
    /** User-provided title/name */
    title: string;
    /** Optional description/content */
    content?: string;
    /** Time range (epoch ms) if applicable */
    timeRange?: { start: number; end: number };
    /** Position for point-based annotations */
    position?: { x: number; y: number };
    /** Associated column name(s) */
    columns?: string[];
    /** Visual color */
    color: string;
    /** Dataset revision when created */
    datasetRevision?: number;
    /** Created timestamp */
    createdAt: number;
    /** Last modified timestamp */
    updatedAt: number;
    /** Page where annotation was created */
    page: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'edatime-annotations';

/** In-memory annotation store */
let annotations: Annotation[] = [];

/** Generate a unique ID */
function generateId(): string {
    return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Load annotations from localStorage */
export function loadAnnotations(): Annotation[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        annotations = parsed.filter((a) => a && typeof a.id === 'string');
        return annotations;
    } catch {
        return [];
    }
}

/** Save annotations to localStorage */
export function saveAnnotations(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    } catch {
        // quota exceeded — silent
    }
}

/** Get all annotations */
export function getAnnotations(): Annotation[] {
    return [...annotations];
}

/** Get annotations for a specific page */
export function getAnnotationsForPage(page: string): Annotation[] {
    return annotations.filter((a) => a.page === page);
}

/** Get annotations within a time range */
export function getAnnotationsInRange(start: number, end: number): Annotation[] {
    return annotations.filter((a) => {
        if (!a.timeRange) return false;
        return a.timeRange.start <= end && a.timeRange.end >= start;
    });
}

/** Create a new annotation */
export function createAnnotation(
    type: AnnotationType,
    title: string,
    options: Partial<Omit<Annotation, 'id' | 'type' | 'title' | 'createdAt' | 'updatedAt'>> = {},
): Annotation {
    const now = Date.now();
    const annotation: Annotation = {
        id: generateId(),
        type,
        title,
        color: options.color || '#ffc041',
        createdAt: now,
        updatedAt: now,
        page: options.page || 'timeseries',
        ...options,
    };
    annotations.push(annotation);
    saveAnnotations();
    return annotation;
}

/** Update an existing annotation */
export function updateAnnotation(id: string, updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>): Annotation | null {
    const idx = annotations.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    annotations[idx] = {
        ...annotations[idx],
        ...updates,
        updatedAt: Date.now(),
    };
    saveAnnotations();
    return annotations[idx];
}

/** Delete an annotation */
export function deleteAnnotation(id: string): boolean {
    const idx = annotations.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    annotations.splice(idx, 1);
    saveAnnotations();
    return true;
}

/** Delete all annotations for a page */
export function clearAnnotationsForPage(page: string): void {
    annotations = annotations.filter((a) => a.page !== page);
    saveAnnotations();
}

/** Clear all annotations */
export function clearAllAnnotations(): void {
    annotations = [];
    saveAnnotations();
}

/** Export annotations as JSON */
export function exportAnnotations(): string {
    return JSON.stringify(annotations, null, 2);
}

/** Import annotations from JSON */
export function importAnnotations(json: string, merge = true): number {
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) return 0;
        const valid = parsed.filter((a) => a && typeof a.id === 'string');
        if (merge) {
            // Merge, avoiding duplicates by ID
            const existingIds = new Set(annotations.map((a) => a.id));
            for (const a of valid) {
                if (!existingIds.has(a.id)) {
                    annotations.push(a);
                }
            }
        } else {
            annotations = valid;
        }
        saveAnnotations();
        return valid.length;
    } catch {
        return 0;
    }
}

/** Create a time-range note */
export function createTimeRangeNote(
    title: string,
    start: number,
    end: number,
    content?: string,
    columns?: string[],
    color?: string,
    datasetRevision?: number,
): Annotation {
    return createAnnotation('note', title, {
        content,
        timeRange: { start, end },
        columns,
        color,
        datasetRevision,
        page: 'timeseries',
    });
}

/** Create a bookmark at a specific time */
export function createBookmark(
    title: string,
    time: number,
    datasetRevision?: number,
): Annotation {
    return createAnnotation('bookmark', title, {
        timeRange: { start: time, end: time },
        datasetRevision,
        page: 'timeseries',
    });
}

/** Create a scatter plot callout */
export function createScatterCallout(
    title: string,
    x: number,
    y: number,
    xCol: string,
    yCol: string,
    content?: string,
): Annotation {
    return createAnnotation('callout', title, {
        content,
        position: { x, y },
        columns: [xCol, yCol],
        page: 'scatter',
    });
}

/** Initialize annotations from storage */
export function initAnnotations(): void {
    loadAnnotations();
    // Expose to window for DataChart overlay rendering
    (window as any).__edatimeAnnotations = {
        getAnnotationsForPage,
        getAnnotationsInRange,
        getAnnotations,
    };
}
