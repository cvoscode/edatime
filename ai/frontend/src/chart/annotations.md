# annotations.ts

Annotation management system for EdaTime supporting named notes tied to time ranges, chart callouts, bookmarks, and persistence across sessions via localStorage.

## Types

```typescript
export type AnnotationType = 'note' | 'callout' | 'region' | 'line' | 'bookmark';
```

## Interface: Annotation

```typescript
export interface Annotation {
  id: string;
  type: AnnotationType;
  title: string;
  content?: string;
  timeRange?: { start: number; end: number };
  position?: { x: number; y: number };
  columns?: string[];
  color: string;
  datasetRevision?: number;
  createdAt: number;
  updatedAt: number;
  page: string;
  metadata?: Record<string, unknown>;
}
```

## Functions

```typescript
export function loadAnnotations(): Annotation[];
export function saveAnnotations(): void;
export function getAnnotations(): Annotation[];
export function getAnnotationsForPage(page: string): Annotation[];
export function getAnnotationsInRange(start: number, end: number): Annotation[];
export function createAnnotation(
  type: AnnotationType,
  title: string,
  options?: Partial<Omit<Annotation, 'id' | 'type' | 'title' | 'createdAt' | 'updatedAt'>>,
): Annotation;
export function updateAnnotation(
  id: string,
  updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>,
): Annotation | null;
export function deleteAnnotation(id: string): boolean;
export function clearAnnotationsForPage(page: string): void;
export function clearAllAnnotations(): void;
export function exportAnnotations(): string;
export function importAnnotations(json: string, merge?: boolean): number;
export function createTimeRangeNote(
  title: string,
  start: number,
  end: number,
  content?: string,
  columns?: string[],
  color?: string,
  datasetRevision?: number,
): Annotation;
export function createBookmark(
  title: string,
  time: number,
  datasetRevision?: number,
): Annotation;
export function createScatterCallout(
  title: string,
  x: number,
  y: number,
  xCol: string,
  yCol: string,
  content?: string,
): Annotation;
export function initAnnotations(): void;
```
