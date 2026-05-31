# ai/frontend/src/chart/annotations.md
> Annotation management system supporting named notes, callouts, regions, lines, and bookmarks tied to time ranges and chart positions.

## Types
- `AnnotationType = 'note' | 'callout' | 'region' | 'line' | 'bookmark'`

## Interface: Annotation
- `id: string` — unique identifier
- `type: AnnotationType`
- `title: string`
- `content?: string`
- `timeRange?: { start: number; end: number }`
- `position?: { x: number; y: number }`
- `columns?: string[]`
- `color: string`
- `datasetRevision?: number`
- `createdAt: number`
- `updatedAt: number`
- `page: string`
- `metadata?: Record<string, unknown>`

## Functions
- `loadAnnotations(): Annotation[]` — Loads annotations from localStorage.
- `saveAnnotations(): void` — Persists annotations to localStorage.
- `getAnnotations(): Annotation[]` — Returns a copy of all annotations.
- `getAnnotationsForPage(page: string): Annotation[]` — Filters annotations by page.
- `getAnnotationsInRange(start: number, end: number): Annotation[]` — Returns annotations whose time range overlaps the given range.
- `createAnnotation(type: AnnotationType, title: string, options?: Partial<Annotation>): Annotation` — Creates a new annotation.
- `updateAnnotation(id: string, updates: Partial<Annotation>): Annotation | null` — Updates an existing annotation.
- `deleteAnnotation(id: string): boolean` — Deletes an annotation by ID.
- `clearAnnotationsForPage(page: string): void` — Removes all annotations for a page.
- `clearAllAnnotations(): void` — Removes all annotations.
- `exportAnnotations(): string` — Returns annotations as JSON string.
- `importAnnotations(json: string, merge?: boolean): number` — Imports annotations from JSON; returns count of imported.
- `createTimeRangeNote(title: string, start: number, end: number, content?: string, columns?: string[], color?: string, datasetRevision?: number): Annotation` — Helper to create a time-bounded note.
- `createBookmark(title: string, time: number, datasetRevision?: number): Annotation` — Helper to create a point-in-time bookmark.
