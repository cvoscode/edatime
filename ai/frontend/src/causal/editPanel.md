# causal/editPanel.md
> Node and pair-edge edit UI. Owns the edit modal, context menu, and all edit-related DOM interactions.

## Types
- `EdgeDraftAttribute` — `{ draftId: string; key: string; value: string }`
- `EdgeDraftConnection` extends `CausalLink` — adds `draftId: string`
- `EdgeEditDraft` — `{ key: string; nodeA: string; nodeB: string; attrs: EdgeDraftAttribute[]; connections: EdgeDraftConnection[] }`

## State
- `_editTarget: EditTarget | null`
- `_edgeEditDraft: EdgeEditDraft | null`
- `_draftSeq: number`

## Functions

### Accessors
- `getEditTarget(): EditTarget | null`
- `setEditTarget(t: EditTarget | null): void`
- `nextDraftId(prefix: string): string`

### Panel Operations
- `openEditPanel(target: EditTarget): void`
- `applyEditPanel(): void`
- `closeEditPanel(): void`
- `deleteTarget(target: EditTarget): void`
- `bindEditPanelEvents(): void`

### Internal
- `escH(value: string): string` — HTML-escapes a string
- `attrsToJson(value: Record<string, unknown> | undefined): string`
- `stringifyDraftValue(value: unknown): string`

---
[1]: ./selectionState.md
[2]: ./statusView.md#setStatus
[3]: ./causalComparison.md#CausalLink