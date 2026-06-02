**Approaches**

1. `Feature-first shell`
   Recommendation. The app is organized around page features as first-class owners, with shared app shell, shared UI primitives/composites, shared services, and a strict API seam. This matches the current direction in `ai/frontend/refactor/*` and gives the best balance of modularity, performance, and refactor safety.

2. `Page-first orchestration`
   Each page owns most of its own wiring and reuses shared helpers opportunistically. This is simpler short-term, but it tends to recreate the current drift where shared behavior exists but is not truly canonical.

3. `Framework-style state rewrite`
   Introduce a deeper architectural reset with a new rendering/state model. This could improve long-term uniformity, but it is too disruptive for the current codebase and would break the iterative refactor goal.

**Recommended Vision**

The target UI architecture is a `feature-first, contract-driven frontend` with a `thin composition root`, `stable shared runtime surfaces`, `strict transport isolation`, and `modular CSS ownership`. The point is not to invent a new frontend stack. The point is to make the current frontend predictable to extend, safe to refactor, and efficient at runtime.

At the highest level, the frontend should have six layers:

- `app/*` as the composition root
- `pages/*` as page runtime owners
- `features/*` as feature policy owners
- `ui/*` as reusable rendering and interaction building blocks
- `store/*` as shared state and event seams
- `services/*` as the only backend-facing transport and pure business helper layer

Each layer should have one job, and code should move downward through explicit interfaces rather than sideways through DOM reach-in or duplicated orchestration.

## Target Architecture

### 1. `app/*` is only the composition root

`frontend/src/app.ts` and `frontend/src/app/*` should become a thin assembly layer. It should create runtimes, initialize global shell behavior, wire page modules, connect feature entrypoints, and own startup order. It should not remain a long-term owner of page-specific logic, chart logic, page-local controls, or transport parsing.

In the target state, `app/*` owns:

- application startup order
- global runtime lifecycle and cleanup
- lazy loading of page modules
- shell-wide bootstrapping
- dependency injection between pages, features, store, and services
- one-time infrastructure such as session restore, keyboard shortcuts, and global accessibility normalization

It should not own:

- per-page fetch/render orchestration
- feature-specific control binding
- API response normalization
- direct DOM behavior for page internals

This gives the system a clear top-level map. When someone opens `app.ts`, they should see composition, not business logic.

### 2. `pages/*` own page runtime behavior

Each page module should be the canonical owner of its runtime. A page is responsible for coordinating what happens when it becomes visible, when it needs data, when loading/empty/status state changes, and when export or chart behavior needs page-specific decisions.

In the target state, a page owns:

- page lifecycle hooks
- page-visible activation
- fetch and render sequencing
- page-local loading, empty, and status state
- page-local control wiring that is not a reusable primitive
- page-specific export semantics
- page-specific chart orchestration

Shared runtime helpers such as `pages/shared/pageRuntime.ts` and `pages/shared/analysisPageRuntime.ts` should become real canonical page-shell utilities, not optional conveniences. They should give every page the same lifecycle vocabulary:

- `mount()`
- `onVisible`
- `onEveryPageChange`
- `updateEmptyState(...)`
- `updateStatus(...)`
- `setLoading(...)`
- optional `bindExports()`

The rule is that shared runtime code owns shell behavior, but pages still own feature behavior. A shared runtime can standardize lifecycle, but it must not absorb the actual business logic of FFT, scatter, drift, spectrogram, or timeseries.

### 3. `features/*` own feature policy

A feature module should be the public owner of a feature’s UI policy and control orchestration. This is where the frontend decides how a user workflow behaves, how a selection is interpreted, how a control graph is composed, and what callbacks are exposed to a page or the app shell.

The feature layer should converge around the contract already captured in [ai/frontend/src/features/shared/featureContract.md](/home/crispy/edatime/ai/frontend/src/features/shared/featureContract.md): a narrow `init()` entrypoint plus optional explicit hooks. That contract should become strict rather than aspirational.

In the target state, features own:

- workflow-specific control composition
- selection/filter/range policy
- feature-local event binding
- feature entrypoint contracts
- state sanitization before page/controller work
- feature-scoped UI decisions

They should not own:

- raw `fetch(...)`
- route construction
- backend payload normalization
- global app shell behavior
- unrelated DOM regions

The goal is that adding a new feature or replacing a control path feels mechanical: create a feature entrypoint, define its dependency contract, keep transport in `services/api/*`, and let the page consume it.

### 4. `ui/*` is the reusable rendering surface

`ui/*` should be the only place for reusable rendering patterns, shared interactive components, and DOM composition helpers that are not tied to one page’s business logic. The codebase already has useful seams here: primitives, composites, modal helpers, chip lists, toolbars, and shell controllers. The target state makes this layer much more deliberate.

Split it into three levels conceptually:

- `ui/primitives/*`
  Small UI atoms with minimal behavior and no business knowledge.
- `ui/composites/*`
  Composed widgets such as range controls, selectors, modals, and chip variants.
- `ui/*` and `ui/shell/*`
  Shared orchestration helpers for drawers, modals, toolbars, overlays, and page-independent shell affordances.

The key rule is that `ui/*` renders and coordinates interaction mechanics, but it does not decide product policy. For example:

- a chip list can preserve keyboard state and render chips consistently
- a modal helper can handle lifecycle and focus management
- a toolbar renderer can standardize sections and actions

But feature-specific meaning such as “which columns are valid here” or “which analytics flow is active” belongs in `features/*` or `pages/*`, not `ui/*`.

### 5. `store/*` is the shared state seam, not a dumping ground

The target store model stays modular and event-based, similar to the current split documented in [ai/frontend/src/store/index.md](/home/crispy/edatime/ai/frontend/src/store/index.md). Shared state should be divided by domain instead of growing a universal mutable object.

Expected stable store areas:

- dataset state
- chart state
- analytics state
- scatter state
- UI state
- runtime state

The store should provide:

- clear getters/setters or domain-specific mutation functions
- typed event emission for cross-layer coordination
- minimal backward-compatibility shims during refactor
- no page-specific DOM behavior
- no hidden transport effects

The store is not the app’s brain. It is a shared memory and event seam. Page and feature modules should still own orchestration.

### 6. `services/*` is the only backend transport boundary

This is one of the most important guardrails. Every HTTP call, request-shape decision, response normalization step, Arrow parsing concern, header interpretation, and fetch utility should stay in `frontend/src/services/api/*`.

That means:

- pages do not build route URLs
- features do not parse transport headers
- UI helpers do not know about backend response envelopes
- app shell does not inspect wire-level payloads

The service layer converts backend responses into frontend-safe structures. Everything above it works with those normalized structures and the contract documented in `ai/contract.md`.

This keeps the frontend/backend seam explicit and dramatically reduces refactor risk.

## CSS Vision

The CSS architecture should become `token-led, layered, and module-owned`, building on the existing modular import entrypoint in [frontend/css/style.css](/home/crispy/edatime/frontend/css/style.css:1).

The current import stack already points in the right direction:

- tokens
- base
- controls
- buttons
- layout
- sidebar
- header
- toolbar
- chips
- modals
- range chips
- upload
- chart
- scatter
- responsive
- scrollbars
- animations
- toast
- palette
- provenance
- settings
- accessibility
- loading
- keyboard help
- what’s new

The target vision is to formalize that into four CSS layers:

### A. Foundation layer

This includes:

- design tokens
- reset/base
- accessibility defaults
- animation primitives
- scrollbar and browser-normalization rules

This layer should define the visual system and global interaction baseline. It should never contain feature-specific selectors.

### B. Primitive/component layer

This includes:

- controls
- buttons
- chips
- modal surface rules
- small reusable shell fragments

This layer maps directly to `ui/primitives/*` and `ui/composites/*`. CSS here should be reusable, low-specificity, and stable across pages.

### C. Layout/shell layer

This includes:

- global page layout
- sidebar
- header
- toolbar regions
- page-level responsive rules
- shell overlays such as settings, command palette, keyboard help, and toasts

This layer belongs to the app shell and shared page shell. It should define structural regions, not page-specific data logic.

### D. Feature/page layer

This includes:

- chart page variants
- scatter-specific layouts
- drift-specific panels
- upload-specific workflow surfaces
- any page-scoped visual state that cannot be generalized

These rules should be isolated and named according to ownership. If a rule only exists because one page works differently, it should live in that page or feature’s CSS module, not get absorbed into a global stylesheet.

## CSS Principles

1. Tokens are the source of truth.
   Colors, spacing, radii, shadows, motion timings, and z-index conventions should come from `tokens.css`. Feature CSS should consume tokens, not hardcode local values unless there is a deliberate exception.

2. Low specificity by default.
   The system should prefer classes and predictable region hooks over selector chains. This makes refactors cheaper and avoids style collisions when shared UI moves across pages.

3. Ownership mirrors code ownership.
   Shared UI styles belong with shared UI modules. Shell styles belong with shell concepts. Feature styles belong with feature concepts.

4. Visual states are explicit.
   Empty, loading, selected, disabled, error, compare, active, and collapsed states should have named classes or data attributes instead of ad hoc DOM mutation.

5. Responsive behavior is structural, not patch-based.
   Responsive rules should describe how layouts collapse or reorder, not retroactively fix brittle desktop assumptions.

6. Accessibility is built in.
   Focus treatment, reduced-motion behavior, keyboard navigability, readable contrast, and label visibility should be first-class CSS concerns rather than cleanup passes.

## Frontend/Backend Contract Vision

The frontend/backend contract should remain centralized in `ai/contract.md` and reflected in code by the strict ownership of `frontend/src/services/api/*` on the frontend and `crates/edatime-service/src/handlers/*` on the backend.

The contract should be treated as a product boundary, not just documentation. That means UI architecture decisions must preserve and clarify the boundary instead of leaking transport details upward.

### Contract principles

1. One route family, one caller surface.
   Each backend route family should map to a clear service module such as:
   - metadata
   - timeseries
   - analytics
   - scatter
   - upload
   - export
   - database

2. Request normalization happens once.
   Converting state into ISO strings, query params, JSON payloads, multipart uploads, or Arrow-specific request semantics should happen inside the service layer.

3. Response normalization happens once.
   Headers, Arrow bodies, JSON fallback shapes, and backend error envelopes should be normalized before returning data to pages/features.

4. Pages consume domain data, not wire data.
   A page should receive typed data like `DatasetMetadata`, `RollingResponse`, `ScatterPointsResponse`, or `DriftResponse`, not raw `Response` objects unless there is a deliberate file-download or streaming case.

5. Contract changes are explicit.
   If a backend shape changes, `ai/contract.md` and the corresponding service module change together. UI code above the service seam should remain insulated.

## How the Contract Shapes the UI

The contract implies several architectural rules for the vision:

- Timeseries and analytics pages must be able to refresh independently while sharing metadata and range state.
- Scatter and drift flows must own their page logic without duplicating transport code.
- Upload and database flows must remain isolated from chart pages except through metadata/bootstrap refresh seams.
- Export behavior must be page-owned but transport-backed through stable service helpers.
- Error handling should distinguish transport failure, computation failure, and empty result state cleanly.

This produces a frontend where backend changes have a narrow blast radius, and UI refactors do not accidentally rewrite data access behavior.

## Performance Vision

The architecture should make the fast path obvious.

### 1. Lazy page activation

Only load and initialize page modules when needed. Hidden pages should not do heavy work. Shared shell code should exist once, but page-local compute should activate on visibility or explicit navigation.

### 2. Stable chart ownership

Chart setup, fallback detection, resize coordination, and export wiring should be page-owned or chart-service-owned, not recreated by multiple consumers. Timeseries remains the primary chart owner; analysis pages use shared shell/runtime helpers but keep their compute/render pipelines isolated.

### 3. Controlled shared state updates

State changes should be domain-specific and event-driven. Broad invalidation or full rebuilds should be reduced in favor of targeted updates such as:

- rebuild chips only
- refresh metadata only
- re-render current data only
- refresh analytics overlay only

### 4. DOM stability

Shared UI helpers such as chip lists, modal controllers, and page runtimes should preserve DOM stability and minimize tear-down/rebuild churn. If transient DOM state must survive rerenders, the shared owner should handle it once.

### 5. Predictable async orchestration

Pages should own cancellation, latest-request wins behavior, and loading state transitions. The service layer fetches, the page decides whether results still matter.

### 6. CSS and rendering efficiency

CSS should avoid deep selector chains and layout thrash-inducing patterns. Structural layout, visibility toggles, and chart overlays should be cheap to update.

## Modularity Vision

The frontend should be modular in a way that supports iterative refactors without forcing big-bang rewrites.

A module is considered healthy if:

- it has one clear owner
- its public API is small
- its dependencies point downward
- its behavior can be tested without booting the entire app
- moving it does not change unrelated modules

The architecture should make these units natural:

- page runtime modules
- feature entrypoints
- chart adapters/controllers
- shared UI renderers
- domain-specific store slices
- API route-family clients
- shell boot modules
- CSS modules mapped to ownership boundaries

This also means discouraging the two failure modes visible in many evolving frontends:

- “god modules” that silently own five unrelated concerns
- “helper sprawl” where shared utilities hide product behavior without becoming real owners

## Target Mental Model

A developer should be able to answer these questions quickly:

- Where does this page boot? `app/*` and `pages/*`
- Where does this user workflow live? `features/*`
- Where is the reusable UI for this pattern? `ui/*`
- Where does shared state for this concern live? `store/*`
- Where does the backend call happen? `services/api/*`
- Where is the documented request/response contract? `ai/contract.md`
- Where is the styling owned? CSS module that mirrors the owning layer

If the architecture achieves that, it becomes easy to develop in, performant by default, and modular enough to keep enhancing without losing control.

## Recommended Canonical Rules

These are the rules I would bake into `ai/Vision.md` as the target standard:

- `app/*` assembles; it does not own feature logic.
- `pages/*` coordinate runtime and rendering for one page.
- `features/*` own workflow and UI policy.
- `ui/*` renders reusable interaction surfaces without business policy.
- `store/*` exposes shared state and typed events, not hidden behavior.
- `services/api/*` is the only HTTP and contract boundary.
- `ai/contract.md` is updated whenever a wire contract changes.
- CSS mirrors ownership: foundation, shared UI, shell, feature/page.
- Shared runtimes are canonical owners, not optional helpers.
- Refactors move code toward these seams; they do not invent parallel abstractions.

