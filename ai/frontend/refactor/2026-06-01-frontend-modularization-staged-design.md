# Frontend Modularization Staged Design

> Extends the direction in `2026-05-30-broad-frontend-consolidation.md`, `2026-05-31-analysis-selection-unification-design.md`, and `2026-06-01-timeseries-ownership-and-shared-shell-design.md`. This design covers the full live frontend, not just Timeseries and analysis pages.

## Goal

Make the live frontend more modular, easier to extend, and easier to refactor by moving duplicated page wiring and mixed responsibilities into clearer shared owners while keeping behavior broadly the same for end users.

## Scope

This design covers:

- `frontend/src/app.ts`
- `frontend/src/app/*`
- `frontend/src/pages/*`
- `frontend/src/features/*`
- `frontend/src/scatter/*`
- shared `frontend/src/ui/*`, `frontend/src/services/*`, and `frontend/src/store/*` seams when they support modularization

This design does not cover:

- route changes
- backend API contract changes
- a state-model rewrite
- replacing the current DOM-driven frontend with a new framework
- visual redesign beyond small consistency cleanups that naturally follow from shared controls

## Constraints

- Preserve current routes, page ids, control ids, export ids, and transport semantics.
- Keep user-visible behavior substantially the same. Small normalization between pages is allowed when it improves consistency and does not break workflows.
- Land the refactor in small, testable phases with verification at each step.
- Prefer extraction, ownership clarification, and contract cleanup over large one-shot rewrites.
- Keep `frontend/src/services/api/*` as the only transport boundary.

## Current Problems

### 1. `app.ts` is still a mixed-responsibility orchestrator

`frontend/src/app.ts` currently combines:

- chart boot and fallback behavior
- page boot sequencing
- timeseries controller composition
- dataset lifecycle work
- global keyboard shortcuts
- analytics refresh coupling

This makes the highest-level module harder to reason about and harder to change safely.

### 2. `app/shell.ts` owns too many unrelated shell behaviors

`frontend/src/app/shell.ts` currently mixes:

- global shell boot
- accessibility normalization
- sample dataset loading
- theme setup
- home-page navigation wiring
- upload/home affordances

That makes the shell layer broad instead of explicit.

### 3. Page modules use inconsistent runtime shapes

The analysis pages already share `pages/shared/analysisPageRuntime.ts`, but the live pages still differ in how they own:

- empty-state lifecycle
- loading/status state
- export binding
- page visibility hooks
- local control binding

The runtime pattern exists, but it is not yet the canonical page shell for the whole frontend.

### 4. Feature entrypoints are uneven

Some feature entrypoints are real owners, while others are little more than pass-through wrappers around large page files. That inconsistency makes it harder to add features in a predictable way.

### 5. Large page files still combine multiple layers of logic

Several page modules still mix:

- lifecycle setup
- fetch orchestration
- render orchestration
- control wiring
- export state
- empty/loading/status state

This makes behavior-preserving change slower than it should be.

### 6. Shared controls exist, but reuse is incomplete

Shared helpers such as `seriesChipList.ts`, empty-state helpers, and page runtimes exist, but many pages still carry repeated glue around those surfaces instead of treating them as canonical owners.

## Recommended Approach

Use a staged modularization strategy across the whole live frontend.

This means:

- standardize page runtime ownership first
- split global boot and shell logic into focused modules
- normalize feature entrypoint contracts
- extract page-scoped controllers/helpers from large page files
- consolidate shared controls once the ownership seams are stable
- add architecture guardrails so the new boundaries hold

This is the best balance of payoff and risk because it allows larger structural improvement without requiring a risky single rewrite.

## Target Architecture

### A. `app/*` becomes a true composition root

`frontend/src/app.ts` should become a thin top-level assembler that:

- wires page, feature, store, and shell modules together
- owns startup order
- owns top-level dependency injection

It should not remain the long-term owner of page-specific lifecycle logic or feature-specific behavior.

### B. `app/shell/*` becomes the canonical global shell layer

The global shell layer should own:

- navigation boot
- command palette and shortcuts boot
- theme/settings boot
- home-page affordances
- sample-dataset affordances
- global accessibility normalization

Instead of one broad file, this layer should move toward focused modules under `frontend/src/app/shell/*` or `frontend/src/app/bootstrap/*`.

### C. `pages/*` becomes the canonical page runtime/controller layer

Each page should own:

- page lifecycle
- page-visible state transitions
- fetch/render sequencing
- page-local loading/empty/status state
- page-local control bindings that are not shared UI primitives

Shared page-shell behavior should live in reusable runtime helpers, but page-specific compute and rendering should stay page-owned.

### D. `features/*` becomes the canonical feature-policy layer

Feature modules should own:

- feature-scoped workflows
- control orchestration
- feature-specific selection/filter policy
- public entrypoint contracts for page boot

They should not become alternate transport owners or global shell owners.

### E. `ui/*`, `services/*`, and `store/*` remain stable shared layers

- `ui/*` owns shared rendering and generic interactions
- `services/*` owns API and pure business helpers
- `store/*` owns state mutation and shared state access seams

The refactor should push code toward these boundaries, not invent new parallel abstractions.

## Standard Runtime Shapes

### Page runtime shape

Pages should converge on a small, consistent runtime contract:

- mount/init
- visible hook
- optional every-page-change hook
- empty-state update surface
- loading/status update surface
- export binding surface when applicable

Not every page needs every hook, but pages should stop inventing incompatible runtime conventions.

### Feature entrypoint shape

Feature entrypoints should converge on:

- explicit dependency input
- one public `init()` path
- optional narrow rebuild/update hooks
- no hidden transport parsing
- no unexpected ownership of unrelated DOM regions

This keeps feature boundaries easy to extend and test.

## Migration Phases

### Phase 1: Stabilize shared page runtime

Strengthen the shared page-runtime pattern into the canonical shell for live pages that need lifecycle, empty-state, loading/status, and export behavior.

Primary candidates:

- `timeseries`
- `fft`
- `heatmap`
- `spectrogram`
- `scatter`
- `causal`
- `drift`

Outcome:

- repeated shell wiring moves out of page-local code
- page modules keep page-specific behavior, but stop re-implementing shell conventions

### Phase 2: Split global app bootstrap

Decompose `frontend/src/app.ts` and `frontend/src/app/shell.ts` into smaller modules such as:

- `app/bootstrap/*`
- `app/shell/*`
- `app/runtime/*`
- `app/navigation/*`

Outcome:

- startup order stays explicit
- global shell concerns stop mixing with page and feature logic

### Phase 3: Normalize feature entrypoints

Make all feature entrypoints follow the same contract style and ownership rules across:

- `timeseries`
- `scatter`
- `fft`
- `heatmap`
- `spectrogram`
- `causal`
- `drift`

Outcome:

- adding a new page or feature follows a repeatable pattern
- feature boot stops depending on inconsistent page-level shortcuts

### Phase 4: Extract page-scoped controllers and helpers

Split large page files into focused page-local units for concerns such as:

- fetch orchestration
- export state
- local control wiring
- chart adapter setup
- local status/empty-state updates

Outcome:

- large page files become coordinators
- local logic becomes easier to test in isolation

### Phase 5: Consolidate shared controls and composites

Standardize reusable UI patterns such as:

- chip lists
- selectors
- filter bars
- empty states
- status views
- modal lifecycle helpers
- export controls

Outcome:

- pages compose shared UI primitives instead of copying DOM glue

### Phase 6: Tighten architecture guardrails

Update validation, tests, and `ai/` documentation to reflect the new boundaries and prevent regression.

Outcome:

- the modular structure becomes enforceable
- future feature work is less likely to recreate old duplication

## Verification Strategy

Each phase should verify at three levels:

### 1. Focused module tests

Run the page, feature, or shared-helper tests directly affected by the phase.

### 2. Lightweight page smoke checks

Verify the major user flows for:

- upload/home
- timeseries
- scatter
- analysis pages
- causal/drift where touched

The goal is not perfect end-to-end coverage in every step, but a quick confidence pass that page workflows still behave as expected.

### 3. Architecture boundary checks

Add or update checks that ensure imports and ownership move toward the intended architecture rather than drifting back.

## Subagent-Friendly Execution Model

This refactor is intentionally suited to subagent-driven execution.

Each phase should be decomposed into small tasks that:

- touch one ownership seam at a time
- run focused verification before moving on
- leave the branch in a coherent state after each checkpoint

That makes larger structural change practical without giving up reviewability.

## Risks And Mitigations

### Risk: shared runtime grows into an over-generic framework

Mitigation:

- keep shared runtime concerns narrow
- leave page-specific compute and render logic in page modules

### Risk: `app.ts` gets split into too many thin wrappers with no clarity gain

Mitigation:

- split only where ownership becomes clearer
- keep startup order visible from one top-level composition path

### Risk: feature entrypoint normalization becomes a hidden rewrite

Mitigation:

- preserve behavior and public contracts
- normalize structure first, then simplify internals

### Risk: shared controls become vague abstractions

Mitigation:

- share DOM mechanics and composition
- keep feature policy in feature modules

### Risk: the refactor stalls after early phases

Mitigation:

- make each phase complete and useful on its own
- add guardrails as the work lands so partial progress still improves the codebase

## Success Criteria

The refactor is successful when:

- `app.ts` is primarily composition, not behavior ownership
- `app/shell.ts` no longer acts as a broad shell grab-bag
- live pages follow a small set of consistent runtime conventions
- feature entrypoints are predictable and explicit
- repeated control/shell logic has canonical shared owners
- future feature work can add new page behavior by composing existing seams instead of copying page-local glue
