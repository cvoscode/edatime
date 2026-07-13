# Plan: Page-level "?" help buttons (start with Home)

## Goal

Add a contextual "?" help affordance to every page in `edatime`, starting
with the Home page. The help should open a **modal dialog** with a
thorough, structured explanation of what the page does, its sections,
the workflow, and useful tips. Other pages (Upload, Timeseries,
Correlations, Scatter, FFT, Spectrogram, Causal, Drift, Settings) get
the same affordance later, reusing a small shared helper.

## Decisions (confirmed with user)

- **Style:** Modal dialog (matches existing `showKeyboardShortcutsHelp` pattern). Not a hover popover.
- **Placement:** Top-right of the page, above the sections (a thin page header bar with the page title and the "?").
- **Scope:** Build a small `pageHelp` shared helper + the Home page in this PR. Other pages reuse the helper in follow-up PRs.
- **Accessibility:** Use a real `<button>` element (not `span` + `role="button"`). Native semantics, Enter/Space, focus ring work for free.

## Why this design

- The codebase already has two established help primitives:
  1. `.toolbar-info-icon` + `bindInfoPopovers()` — small inline popover
  2. `showKeyboardShortcutsHelp()` in [a11y.ts](frontend/src/utils/a11y.ts) — modal dialog
  The modal pattern is the right fit for "thorough explanation" (matches the user's choice), and reusing the existing keyboard-help modal CSS keeps the look consistent.
- A real `<button>` is preferred over `tabindex="0" role="button"` because:
  - Native focus ring, native Enter/Space activation
  - Better screen reader semantics
  - The existing toolbar-info-icon pattern is fine inside dense toolbars, but a page-level help icon deserves first-class semantics
- Placement in a thin page header row keeps the icon visible without competing with the hero CTA, and gives a natural anchor that the other pages can mirror.

## Existing infrastructure to reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| Modal backdrop + `.modal` styles | [modals.css](frontend/css/modules/modals.css) | Reuse directly |
| Keyboard help modal pattern | [a11y.ts:141](frontend/src/utils/a11y.ts#L141) | Mirror the structure |
| Esc-to-close, click-outside-to-close, focus management | [a11y.ts](frontend/src/utils/a11y.ts) | Mirror the patterns |
| Subsystem registration | [deferredSubsystems.ts](frontend/src/app/shell/deferredSubsystems.ts) | Register `page-help` subsystem |
| `data-info-popover-bound` guard pattern | [infoPopovers.ts](frontend/src/ui/infoPopovers.ts) | Mirror the "init-once" pattern |
| `tokens.css`, `--accent`, `--text-dim` | [tokens.css](frontend/css/modules/tokens.css) | All styling uses existing tokens |

## Implementation

### 1. New shared helper — `frontend/src/ui/pageHelp.ts`

```typescript
// filepath: frontend/src/ui/pageHelp.ts
export type PageHelpSection = {
  title: string;
  body: string;           // plain text, one paragraph or bullet lines
  bullets?: string[];     // optional bullet list
};

export type PageHelpContent = {
  pageName: string;       // e.g. "Home"
  intro: string;          // 1–2 sentence overview
  sections: PageHelpSection[];
  shortcuts?: Array<{ keys: string; description: string }>;
  tips?: string[];
};

/**
 * Wire the "?" button for a page. Idempotent: calling more than once is a no-op.
 *
 * - The button must have id="<pageId>-help-btn" and live inside the page section.
 * - The button has data-page-help-btn="true" attribute after wiring (init guard).
 */
export function initPageHelp(pageId: string, content: PageHelpContent): void;
```

- Renders a modal matching the keyboard-help modal structure (`.modal-backdrop` + `.modal` + header + body + close button).
- Closes on: close button click, click outside the dialog, `Esc` key.
- Manages focus: on open, moves focus to the close button; on close, restores focus to the trigger.
- Adds a single CSS class `page-help-modal` so we can target it with a small style block (mostly inherited from `.modal`).

### 2. New CSS — `frontend/css/modules/page-help.css`

Tiny file. Inherits `.modal-backdrop` and `.modal` from `modals.css`. Adds:

```css
.page-help-modal .modal {
  width: min(640px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
}
.page-help-content {
  padding: 16px 18px;
  overflow-y: auto;
  display: grid;
  gap: 16px;
}
.page-help-intro {
  color: var(--text);
  font-size: 0.8125rem;
  line-height: 1.5;
  margin: 0;
}
.page-help-section h4 {
  margin: 0 0 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.page-help-section p {
  margin: 0 0 6px;
  font-size: 0.75rem;
  color: var(--text-dim);
  line-height: 1.5;
}
.page-help-section ul {
  margin: 6px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-dim);
  line-height: 1.5;
}
.page-help-shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.75rem;
  color: var(--text-dim);
}
.page-help-shortcut-row kbd { /* same kbd style as home-shortcut-row */ }
.page-help-tips {
  background: var(--accent-dim);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.page-help-tips h4 { color: var(--text); }
.page-help-tips ul { color: var(--text); }
```

- Register the file in `frontend/css/style.css` (the main stylesheet index).
- Respect `prefers-reduced-motion` (modal backdrop fade matches the keyboard-help modal pattern).

### 3. Wire it on the Home page

#### Markup change — `frontend/index.html` (`#page-home`)

Add a thin page header bar right after the `<section>` opens and before the hero:

```html
<div class="page-header">
  <h1 class="page-header__title">Home</h1>
  <button
    type="button"
    id="home-help-btn"
    class="page-help-trigger"
    aria-label="Show help for the Home page"
    title="Show help for the Home page (?)"
  >?</button>
</div>
```

Note: the existing hero already shows a large `EdaTime` title + tagline. The new thin page header sits *above* the hero, keeps the icon visible at all scroll positions, and matches the structure we will use on the other pages later.

#### New module — `frontend/src/pages/homePage.ts`

```typescript
import { initPageHelp } from '../ui/pageHelp.js';

const HOME_HELP = {
  pageName: 'Home',
  intro: 'Start here. Upload your own CSV or Parquet, …',
  sections: [
    { title: 'What this page is for', body: '…' },
    { title: 'Sections on this page', bullets: [
      'Hero — primary upload entry point',
      'Sample datasets — built-in data to explore',
      'Recommended workflow — Upload → Timeseries → Correlations → Scatter',
      'Advanced analyses — FFT, Spectrogram, Causal, Drift',
      'Keyboard shortcuts — full shortcut reference',
    ]},
    { title: 'How to get started', body: 'Either click "Upload a file to get started" or pick a sample dataset below. …' },
    { title: 'Sample datasets at a glance', bullets: [
      'ETTm2 Sensor Data — 69K rows, 7 columns; best first stop: Timeseries',
      'Sinusoidal Waves — 10K rows; best for FFT / Spectrogram',
      'Weather Patterns — 50K rows, 6 columns; best for Correlations',
    ]},
    { title: 'Tips', body: '…' },
  ],
  shortcuts: [
    { keys: '⌥1–3, 6–0', description: 'Switch major pages' },
    { keys: '⌥4', description: 'Open scatter matrix view' },
    { keys: 'Ctrl+K', description: 'Command palette' },
    { keys: 'Ctrl+I', description: 'Analysis context panel' },
    { keys: '?', description: 'Show this help / keyboard shortcuts' },
  ],
  tips: [
    'Hover any toolbar "?" for a one-line tooltip; click for the full guide.',
    'If WebGPU is unavailable, EdaTime falls back to a Canvas chart — see the indicator next to the page title.',
  ],
};

export function initHomePage(): void {
  initPageHelp('home', HOME_HELP);
}
```

#### Register subsystem — `frontend/src/app/shell/deferredSubsystems.ts`

Add a new subsystem that lazy-loads `homePage.ts`. Trigger it from
`initAppShell()` (or alongside `sample-datasets` in the home-page
init path). Calling it on app boot is cheap because `initPageHelp` is
idempotent and only attaches a single click listener.

### 4. Tests

#### `frontend/src/ui/pageHelp.test.ts` (new)

- Renders the help button → asserts `initPageHelp('test', {...})` is idempotent (calling twice doesn't add a second listener).
- Click the button → modal appears in the DOM with the expected title and intro text.
- `Esc` closes the modal.
- Click on the backdrop closes the modal.
- Click *inside* the modal does not close it.
- Focus moves to the close button on open and back to the trigger on close.

#### `frontend/src/pages/homePage.test.ts` (new)

- `index.html` contains `<button id="home-help-btn">` inside `#page-home`.
- `initHomePage()` adds a `data-page-help-bound="true"` attribute to the button.
- After wiring, clicking the button appends a `.page-help-modal` to `document.body`.
- The modal contains the page name and at least one section heading.

### 5. CSS / HTML / asset versioning

- Bump the `?v=` query on `style.css` and any changed assets per the existing convention in [copilot-instructions.md](../.github/copilot-instructions.md) ("bump version query strings").
- The new `page-help.css` file is small enough to be served directly via `style.css` (no separate HTTP request).

## Out of scope (for follow-up PRs)

- Adding help to the other 9 pages (Upload, Timeseries, Correlations, Scatter, FFT, Spectrogram, Causal, Drift, Settings). The shared `initPageHelp(pageId, content)` helper makes each one a 20-line content object + a single `initPageHelp(...)` call.
- A persistent "?" button in the sidebar (could be a v2 — single shortcut to open the current page's help). Not needed for v1.
- Localising the help copy. v1 is English only, matching the rest of the app.

## Risks

- **Hotspot churn:** [frontend/src/app.ts](frontend/src/app.ts) is a 99.9th percentile churn file. I'm *not* editing it; the new wiring goes through `deferredSubsystems.ts` and a new module, which is the documented extension point.
- **Modal stacking:** ensure only one help modal can be open at a time. The `initPageHelp` helper will remove any pre-existing `.page-help-modal` before opening a new one.
- **Focus restoration:** when navigating between pages, the trigger button may have been re-rendered. Restoring focus to the element by id is sufficient; if it's gone, focus goes to `<body>` (no error).
- **CSS specificity:** I'm only adding one new class to elements that already exist; `.page-help-modal .modal` keeps the existing `.modal` rules winning where they should.

## Files touched

| File | Change |
|------|--------|
| `frontend/src/ui/pageHelp.ts` | New — shared helper |
| `frontend/src/ui/pageHelp.test.ts` | New — helper unit tests |
| `frontend/src/pages/homePage.ts` | New — Home page init + content |
| `frontend/src/pages/homePage.test.ts` | New — Home page wiring tests |
| `frontend/css/modules/page-help.css` | New — minimal modal styling |
| `frontend/css/style.css` | Register the new stylesheet |
| `frontend/index.html` | Add page header with "?" button to `#page-home` |
| `frontend/src/app/shell/deferredSubsystems.ts` | Register `page-help` subsystem |

## Open question for the user

- **Help copy tone** — should the body be terse (one-liner per section) or full paragraphs? Default plan: terse with bullets, matching the existing UI copy style. Easy to extend later.
