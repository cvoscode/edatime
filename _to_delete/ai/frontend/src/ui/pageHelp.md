# ai/frontend/src/ui/pageHelp.md
> Shared "?" help modal helper used by every page-level help button. Renders a `.modal-backdrop.page-help-modal` with intro, sections, optional keyboard shortcuts, and tips.

## Constants
- `MODAL_ID = 'page-help-modal'` — singleton modal element id.
- `BOUND_ATTR = 'data-page-help-bound'` — guard attribute written on the trigger button after first bind.

## Interface `PageHelpShortcut`
- `keys: string`
- `description: string`

## Interface `PageHelpSection`
- `title: string`
- `body?: string`
- `bullets?: string[]`

## Interface `PageHelpContent`
- `pageName: string`
- `intro: string`
- `sections: PageHelpSection[]`
- `shortcuts?: PageHelpShortcut[]`
- `tips?: string[]`

## Functions
- `initPageHelp(pageId: string, content: PageHelpContent): void`
  - Looks up `<pageId>-help-btn`, sets `data-page-help-bound` once and wires a click handler. Re-calls are no-ops.
- `openPageHelp(content: PageHelpContent, trigger: HTMLElement): void`
  - Replaces any existing modal, builds the modal via `innerHTML`, attaches close (button, backdrop, Esc) handlers, and focuses the close button via `queueMicrotask`.
- `closePageHelp(trigger: HTMLElement): void`
  - Dispatches a synthetic `cleanup` event (to detach the keydown listener), removes the modal, and restores focus to the trigger or `document.body` if the trigger was removed.

---
[1]: ./a11y.md#showWhatsNewModal