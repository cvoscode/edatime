# Frontend UI Canonicalization And Analytics Page Scaffold Design

## Goal

Refactor the frontend in small, behavior-preserving steps so shared UI has one canonical internal surface and repeated analytics-page setup lives behind a focused shared scaffold.

## Context

This design is based on the current frontend source and the repository architecture mirrors in `ai/`, especially:

- `ai/README.md`
- `ai/frontend/src/app.md`
- `ai/frontend/src/dataClient.md`
- `ai/frontend/src/types.md`
- `docs/superpowers/specs/2026-05-28-frontend-foundations-refactor-design.md`

The current frontend already moved most reusable UI into `frontend/src/ui/`, but two structural issues remain:

1. `frontend/src/components/` still exists as a parallel shared-component namespace, even though it is now only a re-export layer.
2. `frontend/src/pages/fftPage.ts`, `frontend/src/pages/heatmapPage.ts`, and `frontend/src/pages/spectrogramPage.ts` repeat the same page-level setup pattern:
   - lazy empty-state controller setup
   - `createPageLifecycle(...)` registration
   - export button binding
   - one-time page boot plus per-visibility callbacks

## Constraints

- Preserve current runtime behavior, DOM ids, event names, page routes, and export semantics.
- Keep changes incremental and locally verifiable.
- Do not fold unrelated `app.ts` or store refactors into this wave.
- Prefer compatibility adapters and architecture guardrails over deletion-first changes.

## Problems To Solve

### 1. Shared UI Still Looks Like Two Systems

`frontend/src/ui/` is the real implementation surface, but `frontend/src/components/` still reads like a second component library. Even when behavior is identical, the duplicate namespace makes future work slower because engineers still have to ask which import path is correct.

### 2. Analytics Pages Repeat The Same Boot Pattern

FFT, heatmap, and spectrogram each compose the same low-level helpers in slightly different ways. The repeated code is not the chart logic itself; it is the page shell around that logic. That duplication increases the cost of future page changes and creates avoidable drift in initialization and empty-state handling.

### 3. Existing Shared Helpers Stop Slightly Too Low In The Stack

The codebase already has:

- `frontend/src/app/pageLifecycle.ts`
- `frontend/src/ui/emptyState.ts`
- `frontend/src/utils/bindExportButtons.ts`

Those helpers remove some duplication, but each page still reassembles the same higher-level pattern manually. The next clean step is to extract that composition without absorbing page-specific fetch and render logic.

## Design Principles

- One canonical internal UI surface.
- Compatibility before deletion.
- Shared scaffolds may own orchestration, but not feature logic.
- Extract only duplication that already exists in at least two pages.
- Prefer named boundaries over generic utility piles.

## Module Design

### A. Canonical Shared UI Surface

`frontend/src/ui/` remains the only supported internal shared UI namespace.

#### Canonical modules

- `frontend/src/ui/primitives/*`
- `frontend/src/ui/composites/*`
- `frontend/src/ui/primitives/index.ts`
- `frontend/src/ui/composites/index.ts`
- `frontend/src/ui/index.ts`

#### Compatibility layer

`frontend/src/components/*` stays temporarily, but only as a compatibility facade with no unique behavior. Its contract becomes explicit:

- it may re-export from `ui/`
- it must not gain new implementation logic
- internal runtime modules must not import from it

#### Guardrail

`scripts/check-frontend-architecture.mjs` will fail if any internal module outside `frontend/src/components/` imports from `components/`.

That turns the current informal direction into an enforced rule and makes the codebase future-proof without requiring a risky delete-first cleanup.

### B. Analytics Page Scaffold

Introduce one page-layer helper dedicated to repeated analytics-page shell behavior.

#### New module

- `frontend/src/pages/shared/analysisPageRuntime.ts`

#### Responsibility

This module owns the composition of:

- lazy empty-state controller access
- page lifecycle registration through `createPageLifecycle(...)`
- one-time export binding
- page activation callbacks

It does **not** own:

- FFT trace fetching
- heatmap matrix rendering
- spectrogram ECharts configuration
- page-specific status text content
- chart interaction semantics

#### Proposed surface

The helper stays small and explicit:

```ts
interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    bindExports?: () => void;
    init?: () => void | (() => void);
    onVisible?: () => void;
}

interface AnalysisPageRuntime {
    mount(): () => void;
    updateEmptyState(model: EmptyStateViewModel): void;
}
```

This keeps shared ownership narrow: the helper handles page shell composition, while each page still decides when it has data, what message to show, and how to render its chart or matrix.

### C. Page Ownership After Refactor

#### `frontend/src/pages/fftPage.ts`

Keeps ownership of:

- FFT trace selection
- chip rendering and chip loading state
- zoom reset behavior
- spectral filter preview logic
- FFT export payload shape

Moves out:

- lazy empty-state singleton boilerplate
- page lifecycle and export-binding shell wiring

#### `frontend/src/pages/heatmapPage.ts`

Keeps ownership of:

- matrix fetch policy
- correlation coloring
- HTML grid rendering
- click-through into Scatter

Moves out:

- lazy empty-state singleton boilerplate
- page lifecycle and export-binding shell wiring

#### `frontend/src/pages/spectrogramPage.ts`

Keeps ownership of:

- ECharts boot and resize handling
- drag-to-zoom logic
- spectrogram fetch/render logic
- axis and tooltip formatting

Moves out:

- lazy empty-state singleton boilerplate
- page lifecycle and export-binding shell wiring

## Target File Structure After This Refactor Wave

```text
frontend/src/
├── components/
│   └── ... compatibility re-exports only
├── pages/
│   ├── fftPage.ts
│   ├── heatmapPage.ts
│   ├── spectrogramPage.ts
│   └── shared/
│       └── analysisPageRuntime.ts
├── ui/
│   ├── primitives/
│   ├── composites/
│   └── index.ts
└── scripts/
    └── check-frontend-architecture.mjs
```

## Migration Strategy

### Wave 1: Make The Canonical UI Surface Explicit

- move canonical shared-component tests to `ui/`
- keep `components/` as pure adapters
- add an architecture rule that blocks new internal imports from `components/`

This is the smallest safe step that resolves the ambiguity without forcing deletion.

### Wave 2: Extract The Analytics Page Shell

- add `frontend/src/pages/shared/analysisPageRuntime.ts`
- refactor `fftPage.ts`, `heatmapPage.ts`, and `spectrogramPage.ts` to use it
- keep each page’s data/render logic in place

This reduces duplication while preserving the current page module boundaries.

### Wave 3: Optional Cleanup After Soak Time

If there are no remaining non-test consumers that need `frontend/src/components/`, remove that compatibility facade in a separate cleanup change.

This is intentionally not part of the first execution wave.

## Validation Strategy

- Targeted Vitest coverage for canonical `ui/` imports.
- Targeted Vitest coverage for the new analysis page runtime helper.
- Existing FFT page tests updated to verify behavior still matches.
- New focused tests for heatmap and spectrogram shell behavior where coverage is currently thin.
- `npm run check:frontend`
- `npm run test -- <targeted files>`
- `npm run validate`

## Out Of Scope

- rewriting `app.ts`
- changing store boundaries
- converting the app to Solid
- changing page markup contracts beyond what shared shell extraction requires
- changing FFT, heatmap, or spectrogram runtime behavior

## Why This Design

This is the cleanest behavior-preserving path because it fixes the two current structural ambiguities without pretending the app needs a rewrite:

- `ui/` becomes the enforced source of truth for shared UI
- repeated analytics page shell logic moves into one small shared module
- page-specific behavior stays where it already works

That gives the frontend a clearer long-term shape while keeping the refactor small enough to verify safely.
