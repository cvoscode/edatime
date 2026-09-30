# frontend/src/ui/analysisStatus.ts
> Live status text displayed in the analysis toolbar panel. Updated on zoom, Y-range, cursor, and click events.

## Functions
- `updateAnalysisZoom(startMs: number, endMs: number, sourceKind?: string): void`
  - Updates the zoom range display text.
- `updateAnalysisYRange(min: number, max: number, sourceKind?: string): void`
  - Updates the Y-axis range display text.
- `updateAnalysisCursor(tsMs: number): void`
  - Updates the cursor timestamp display.
- `updateAnalysisClick(payload: { value?: number[]; seriesName?: string } | null): void`
  - Updates the click position display text.
