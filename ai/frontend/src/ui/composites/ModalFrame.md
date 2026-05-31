# ai/frontend/src/ui/composites/ModalFrame.md
> Renders a dialog frame with a title, close button, and scrollable body region.

## Interface: ModalFrameProps
```typescript
interface ModalFrameProps {
    title: string;
    id?: string;
    onClose?: () => void;
}
```

## Function: ModalFrame
```typescript
function ModalFrame(props: ModalFrameProps): HTMLDivElement
```
Creates a `<div role="dialog" aria-modal="true">` with a header (title + × button) and a `.modal-frame__body` container.

---
[1]: index.md
  - Creates a modal dialog with title, close button, and body slot.

## ModalFrameProps
- `title: string`
- `id?: string`
- `onClose?: () => void`