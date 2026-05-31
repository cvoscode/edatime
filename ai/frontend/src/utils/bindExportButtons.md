# ai/frontend/src/utils/bindExportButtons.md

> Declaratively wires PNG/SVG/HTML/CSV export buttons across FFT, heatmap, and spectrogram pages.

## Interface: ExportButtonConfig
```typescript
interface ExportButtonConfig {
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}
```

## Functions
- `bindExportButtons(prefix: string, config: ExportButtonConfig): void`
  - Binds click handlers to export buttons for a given page prefix.

---
[1]: ./toast.md