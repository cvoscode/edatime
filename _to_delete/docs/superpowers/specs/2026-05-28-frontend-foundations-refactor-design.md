# Frontend Foundations Refactor Design

**Date:** 2026-05-28
**Status:** Approved

## Goal

Refactor the frontend foundations so shared UI behavior, page lifecycle, and feature ownership are easier to reason about, test, and extend, while preserving current runtime behavior. The refactor should be incremental, but the resulting boundaries should support a later migration to fuller component-based rendering if the team chooses to pursue it.

## Context

This design is based on the current frontend source and the repository’s AI reference material, especially:

- `ai/frontend/src/app.md`
- `ai/frontend/src/features/timeseries/columnsController.md`
- `ai/frontend/src/ui/modalUtils.md`
- `ai/frontend/src/ui/settingsPanel.md`
- `docs/developer/frontend.md`
- `docs/developer/timeseries-page.md`

The current architecture has already started to split responsibilities, but it still carries overlap between:

- `frontend/src/app.ts`
- `frontend/src/bootstrap/appShell.ts`
- `frontend/src/bootstrap/pageLoaders.ts`
- `frontend/src/ui/*`
- `frontend/src/components/*`

## Problems To Solve

### 1. Boot And Lifecycle Logic Is Split Across Multiple Layers

`frontend/src/app.ts` still owns significant lifecycle and feature behavior, while `bootstrap/appShell.ts` and `bootstrap/pageLoaders.ts` also coordinate page readiness, UI wiring, and dataset-driven initialization. This makes the boot path harder to modify safely.

### 2. Shared UI Exists In Two Parallel Systems

The codebase has both:

- reusable DOM-oriented UI factories under `frontend/src/components/`
- imperative page and shared UI modules under `frontend/src/ui/`

This is a maintainability problem because the app pays for both abstractions at once. Shared widgets such as chips, modals, and range controls are only partially consolidated.

### 3. Feature Behavior Leaks Into Shared Modules

Timeseries-specific interactions, especially column filters, adaptive filtering, and chart coordination, are spread across `app.ts`, `ui/columns.ts`, `bootstrap/timeseriesBootstrap.ts`, and `pages/timeseriesPage.ts`. This increases coupling and makes reuse across pages difficult.

### 4. The Current Structure Does Not Scale Cleanly

The app can ship features in its current form, but cross-app work such as new modal patterns, keyboard interactions, analytics panels, and page-level controllers will become slower and riskier if ownership remains ambiguous.

## Design Principles

- Preserve existing behavior and public entrypoints during the migration.
- Prefer additive extraction and compatibility shims over large rewrites.
- Keep feature logic close to the feature that owns it.
- Keep shared UI dumb: it should emit intent, not mutate feature state directly.
- Keep store, service, and chart code framework-agnostic.
- Make the post-refactor boundaries compatible with later Solid-driven rendering if the team chooses to move further.

## Target Architecture

### App Layer

Introduce a clearer app-level surface under `frontend/src/app/`:

- `frontend/src/app/runtime.ts`
  - owns shared runtime dependencies, cleanup registration, and app-wide coordination helpers
- `frontend/src/app/shell.ts`
  - owns global shell initialization, route activation hooks, keyboard/bootstrap wiring, and shared UI setup
- `frontend/src/app/pageRegistry.ts`
  - owns page loader registration, metadata gating, and lazy feature loading

`frontend/src/app.ts` remains the browser entrypoint, but becomes a thin assembly module that wires the app runtime, chart runtime, and feature entrypoints together.

### Shared UI Layer

Consolidate reusable UI under one canonical namespace in `frontend/src/ui/`:

- `frontend/src/ui/primitives/`
  - buttons, selects, text inputs, color inputs, low-level chips, modal frames
- `frontend/src/ui/composites/`
  - `SeriesChip`, `RangeChip`, `ColorBySelect`, `ColumnSelector`, `RangeControls`, `ColumnFilterModal`
- `frontend/src/ui/shell/`
  - modal controllers, drawer controllers, panel helpers, and shell-scoped interactions

The existing `frontend/src/components/` tree should become compatibility adapters during the migration. The canonical implementation should live in `frontend/src/ui/`, with `components/` re-exporting those implementations until call sites are updated.

### Feature Layer

Promote page-specific behavior into explicit feature entrypoints under `frontend/src/features/`.

For the initial pilot:

- `frontend/src/features/timeseries/entrypoint.ts`
  - owns timeseries-specific wiring, builds its own controller surface, and coordinates chart interactions, filters, upload/profile hooks, and shared UI composites

For follow-on work:

- `frontend/src/features/scatter/entrypoint.ts`
- `frontend/src/features/causal/entrypoint.ts`
- `frontend/src/features/drift/entrypoint.ts`
- `frontend/src/features/fft/entrypoint.ts`
- `frontend/src/features/spectrogram/entrypoint.ts`
- `frontend/src/features/heatmap/entrypoint.ts`

These entrypoints should wrap existing page modules first, not replace them wholesale.

### Core Layer

The following stay renderer-agnostic and should not absorb UI-specific concerns:

- `frontend/src/store/*`
- `frontend/src/services/*`
- `frontend/src/chart/*`
- `frontend/src/charts/*`
- `frontend/src/utils/*`

## Ownership Model

### App Owns

- startup and dependency assembly
- page registration and lazy loading
- cleanup registration
- shared shell wiring
- global error and readiness boundaries

### Shared UI Owns

- rendering primitives
- composable widget factories
- modal and drawer controller mechanics
- shell-level interaction helpers

### Features Own

- feature-specific state transitions
- wiring UI intents to store and service calls
- page-local event contracts
- page-specific fallback behavior

### Shared UI Must Not Own

- direct writes into feature state
- direct API orchestration
- cross-feature business rules

This rule is what keeps the architecture incremental now and still compatible with a future component-based rewrite later.

## Initial File Structure Direction

The refactor should aim toward this structure without requiring all moves at once:

```text
frontend/src/
├── app/
│   ├── runtime.ts
│   ├── shell.ts
│   └── pageRegistry.ts
├── ui/
│   ├── primitives/
│   ├── composites/
│   └── shell/
├── features/
│   ├── timeseries/
│   │   ├── entrypoint.ts
│   │   ├── columnsController.ts
│   │   ├── chartInteractions.ts
│   │   └── uploadBridge.ts
│   ├── scatter/
│   ├── causal/
│   ├── drift/
│   ├── fft/
│   ├── spectrogram/
│   └── heatmap/
├── store/
├── services/
├── chart/
├── charts/
└── utils/
```

Compatibility adapters are acceptable during the migration:

- `frontend/src/ui/columns.ts` can temporarily re-export feature-owned timeseries functionality.
- `frontend/src/components/*` can temporarily re-export canonical `ui/` modules.
- existing `bootstrap/*` modules can be reduced gradually rather than deleted immediately.

## Migration Strategy

### Phase 1: App-Shell Foundation

Extract lifecycle, page registry, and global shell setup out of `app.ts` and `bootstrap/appShell.ts` into a smaller app-level API. Keep the old call surface working until tests pass.

### Phase 2: Shared UI Consolidation

Create canonical `ui/primitives`, `ui/composites`, and `ui/shell` modules. Move reusable implementation there and leave adapters in `components/` and legacy `ui/` modules where necessary.

### Phase 3: Timeseries Feature Entry

Make timeseries the first feature with a clear entrypoint. Move ownership of column filters, range controls, adaptive interactions, and upload/profile coordination behind that feature boundary.

### Phase 4: Cross-App Adoption

Adapt scatter, causal, drift, FFT, and spectrogram loading to the same page-registry and feature-entrypoint model. Existing page init functions can remain internally imperative until later cleanup.

## Validation Strategy

The migration should be validated with targeted tests at each phase:

- app lifecycle and page-registry tests
- shared UI factory tests
- modal and drawer controller tests
- timeseries feature orchestration tests
- existing targeted page tests
- `npm run typecheck`
- `npm test`

The goal is to prove the architecture changed without changing user-visible behavior.

## Out Of Scope

- replacing the custom store with a framework state library
- rewriting all UI into Solid in this refactor
- changing analytics behavior or chart rendering semantics
- redesigning page layouts beyond what is needed to support the new boundaries

## Why This Design

This is Option B by design: feature entrypoints plus one shared UI system. It directly addresses the main structural issues in the current frontend while avoiding rewrite-first risk. It also creates the necessary seam for a future Option C, where selected shared UI pieces could be swapped to Solid component composition without reopening app and feature contracts.
