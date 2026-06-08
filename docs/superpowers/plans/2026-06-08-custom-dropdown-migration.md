# Custom Dropdown Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace interactive native dropdowns across the app with a shared custom dropdown system that matches the app's light/dark visual language and preserves behavior, accessibility, and dynamic option updates.

**Architecture:** Introduce a shared dropdown primitive plus a controller registry that upgrades page markup into custom listbox-based controls at bootstrap time. Migrate app code from direct `HTMLSelectElement` access to dropdown helpers that support reading values, updating options, toggling disabled state, and listening for change events across scatter, FFT, spectrogram, drift, upload, settings, causal, and modal flows.

**Tech Stack:** TypeScript, DOM APIs, Vitest, existing CSS module system

---

### Task 1: Add the shared dropdown primitive and registry

**Files:**
- Create: `frontend/src/ui/primitives/Dropdown.ts`
- Modify: `frontend/src/ui/primitives/index.ts`
- Modify: `frontend/src/ui/primitives/Select.ts`
- Test: `frontend/src/ui/primitives/Dropdown.test.ts`

- [ ] **Step 1: Write failing primitive tests**
- [ ] **Step 2: Run primitive tests to verify failure**
- [ ] **Step 3: Implement dropdown primitive, controller API, and registry helpers**
- [ ] **Step 4: Re-run primitive tests to verify pass**

### Task 2: Add dropdown styling and app-wide upgrade bootstrap

**Files:**
- Modify: `frontend/css/modules/controls.css`
- Modify: `frontend/css/modules/chips.css`
- Modify: `frontend/css/modules/modals.css`
- Modify: `frontend/css/modules/settings.css`
- Modify: `frontend/css/modules/toolbar.css`
- Modify: `frontend/css/modules/a11y.css`
- Modify: `frontend/css/modules/responsive.css`
- Modify: `frontend/src/app.ts`
- Test: `frontend/src/ui/primitives/Dropdown.test.ts`

- [ ] **Step 1: Extend tests for keyboard behavior, theme classes, and outside-click close**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Implement shared dropdown surface styles and bootstrap upgrade scan**
- [ ] **Step 4: Re-run targeted tests to verify pass**

### Task 3: Migrate shared UI, session, settings, and upload flows

**Files:**
- Modify: `frontend/src/ui/composites/ColorBySelect.ts`
- Modify: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/ui/settingsPanel.ts`
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/features/upload/preview.ts`
- Modify: `frontend/src/features/upload/databaseSource.ts`
- Modify: `frontend/src/features/timeseries/filterModalController.ts`
- Modify: `frontend/src/utils/session.ts`
- Test: `frontend/src/ui/upload.test.ts`
- Test: `frontend/src/features/timeseries/filterModalController.test.ts`

- [ ] **Step 1: Write or update failing tests for shared UI flows that mutate dropdown options and values**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Migrate shared UI and settings/upload/session code to dropdown helpers**
- [ ] **Step 4: Re-run targeted tests to verify pass**

### Task 4: Migrate scatter, FFT, spectrogram, and heatmap flows

**Files:**
- Modify: `frontend/src/scatter/state.ts`
- Modify: `frontend/src/scatter/controls.ts`
- Modify: `frontend/src/scatter/rendering.ts`
- Modify: `frontend/src/scatter/runtime.ts`
- Modify: `frontend/src/scatter/viewController.ts`
- Modify: `frontend/src/scatter/matrix.ts`
- Modify: `frontend/src/scatter/correlationsPanel.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Test: `frontend/src/scatter/controls.test.ts`
- Test: `frontend/src/scatter/rendering.test.ts`
- Test: `frontend/src/scatter/scatterPage.test.ts`
- Test: `frontend/src/scatter/runtime.test.ts`
- Test: `frontend/src/scatter/layout.test.ts`
- Test: `frontend/src/pages/fftPage.test.ts`
- Test: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Write or update failing tests for analysis page dropdown interactions**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Migrate analysis-page modules from `HTMLSelectElement` access to dropdown helpers**
- [ ] **Step 4: Re-run targeted tests to verify pass**

### Task 5: Migrate causal, drift, toolbar, draw, and modal flows

**Files:**
- Modify: `frontend/src/causal/causalPage.ts`
- Modify: `frontend/src/causal/causalComparison.ts`
- Modify: `frontend/src/causal/editPanel.ts`
- Modify: `frontend/src/causal/workflow.ts`
- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/drift/controls.ts`
- Modify: `frontend/src/ui/drawControls.ts`
- Modify: `frontend/src/ui/analyticsControls.ts`
- Modify: `frontend/src/ui/dataMutationModals.ts`
- Test: `frontend/src/causal/causalPage.test.ts`
- Test: `frontend/src/drift/driftPage.test.ts`
- Test: `frontend/src/drift/driftPage.visibility.test.ts`

- [ ] **Step 1: Write or update failing tests for advanced-analysis dropdown flows**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Migrate remaining page and modal flows to dropdown helpers**
- [ ] **Step 4: Re-run targeted tests to verify pass**

### Task 6: Final verification and cleanup

**Files:**
- Review only: `frontend/index.html`
- Review only: `frontend/src/**/*.ts`
- Review only: `frontend/css/modules/*.css`

- [ ] **Step 1: Run targeted dropdown-related test suite**
- [ ] **Step 2: Run frontend typecheck**
- [ ] **Step 3: Run full Vitest suite or the broadest stable subset**
- [ ] **Step 4: Review diff for leftover native interactive selects or stale helper usage**
