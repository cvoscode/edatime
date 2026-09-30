# frontend/src/ui/annotationPanel.ts
> Wires up annotation toolbar buttons to the annotations store and manages the annotation list modal.

## Functions
- `setAnnotationOverlayCallback(cb: () => void): void`
  - Sets callback to request overlay re-render when annotations change.
- `initAnnotationPanel(): void`
  - Initializes toolbar buttons, modal event handlers, and keyboard shortcuts.
