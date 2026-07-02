# Spectrogram Custom Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the spectrogram normalization/control contract so normalization and clip changes only apply after `Compute`, while adding `Custom` window and hop controls that reveal numeric sample inputs.

**Architecture:** Keep the existing spectrogram preset dropdowns as the primary controls, add `custom` sentinel options plus revealed numeric inputs, and centralize compute-parameter parsing inside `spectrogramChartRuntime.ts`. Preserve the backend contract by continuing to send numeric `window_size` / `hop_size` query params to `/api/analytics/spectrogram`, and tighten the frontend behavior so non-log display controls no longer mutate the cached chart result until the user recomputes.

**Tech Stack:** Vanilla TypeScript, Vitest, existing custom dropdown primitive, Axum/Rust spectrogram API.

---

### Task 1: Add regression tests for staged normalization and custom controls

**Files:**
- Modify: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] Add a failing test that changes `#spectrogram-normalize` after the first auto-compute and asserts `fetchSpectrogram` is not called again until `#spectrogram-compute-btn` is clicked.
- [ ] Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`
- [ ] Confirm the new test fails for the expected reason.

### Task 2: Add custom window/hop UI and runtime parsing

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] Add `Custom` options to `#spectrogram-win-size` and `#spectrogram-hop-size`, plus hidden numeric inputs for custom sample values.
- [ ] Add runtime helpers that toggle those custom inputs, parse either preset or custom values, and clamp invalid custom values to safe spectrogram bounds before compute.
- [ ] Change normalization/clip listeners so they only update labels/disabled state and never rerender an existing spectrogram.
- [ ] Extend the tests to cover custom-input visibility and the computed `fetchSpectrogram(..., windowSize, hopSize, ...)` arguments for custom mode.
- [ ] Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`
- [ ] Confirm all spectrogram page tests pass.

### Task 3: Verify the spectrogram path end-to-end

**Files:**
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] Run: `npm run check:frontend`
- [ ] Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`
- [ ] If the runtime/API seam changed materially, update the `ai/` mirror for the touched spectrogram page files.
