# frontend/src/utils/bindExportButtons.ts
> Declaratively wires PNG/SVG/HTML/CSV export buttons — replaces repeated boilerplate across fftPage, heatmapPage, spectrogramPage.

## Interface: ExportButtonConfig
```typescript
interface ExportButtonConfig {
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}
```

## Function: bindExportButtons
- `bindExportButtons(prefix: string, config: ExportButtonConfig): void`
  - Binds click handlers to `{prefix}-export-png-btn`, `{prefix}-export-svg-btn`, `{prefix}-export-html-btn`, and optionally `{prefix}-export-csv-btn`.
  - Shows toast warning if CSV export attempted with no data and `dataCheck` returns false.

---
[1]: ./chartExport.md