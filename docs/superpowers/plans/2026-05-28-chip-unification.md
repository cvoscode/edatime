# Unified Chip Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all inline chip implementations across pages with a single `SeriesChip` component providing consistent on/off toggle, color selection, and optional three-dot menu.

**Architecture:** Enhance the existing `SeriesChip` component with optional menu support, disabled state, and enhanced props. Then migrate timeseries, FFT, and causal pages to use it.

**Tech Stack:** TypeScript, Vanilla DOM (no framework), Vitest

---

## Files

- **Modify:** `frontend/src/components/molecules/SeriesChip.ts` — add optional menu, disabled support
- **Modify:** `frontend/src/features/timeseries/columnsController.ts` — use enhanced SeriesChip
- **Modify:** `frontend/src/pages/fftPage.ts` — use enhanced SeriesChip with checkbox toggle
- **Modify:** `frontend/src/causal/causalPage.ts` — use enhanced SeriesChip with checkbox toggle
- **Create:** `frontend/src/components/molecules/SeriesChip.test.ts` — add tests for new behavior
- **Modify:** `frontend/css/modules/chips.css` — add disabled state styles

---

## Task 1: Enhance SeriesChip Component

**Files:**
- Modify: `frontend/src/components/molecules/SeriesChip.ts`

- [ ] **Step 1: Write the failing test**

Create test file at `frontend/src/components/molecules/SeriesChip.test.ts` with tests for:
- Renders correct structure (label, checkbox, color picker, label span)
- Applies active class when checked
- Calls onToggle when checkbox changes
- Calls onColorInput when color changes
- Does not render menu button when onMenuClick not provided
- Renders menu button and calls onMenuClick when provided
- Stops propagation on color picker clicks
- Stops propagation on menu button clicks
- Applies disabled styling when disabled prop is true
- Uses custom label when provided
- Uses custom title when provided

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run src/components/molecules/SeriesChip.test.ts`
Expected: FAIL — file does not exist yet

- [ ] **Step 3: Implement enhanced SeriesChip**

Update `frontend/src/components/molecules/SeriesChip.ts` with:
- Add `disabled?`, `menuLabel?`, `label?`, `title?`, `onMenuClick?` props
- Conditionally render menu button only when `onMenuClick` provided
- Add `disabled` class and attribute when `disabled: true`
- Stop propagation on color picker and menu button clicks
- Use `props.label ?? props.column` for display text

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run src/components/molecules/SeriesChip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

---

## Task 2: Add disabled CSS state

**Files:**
- Modify: `frontend/css/modules/chips.css`

- [ ] **Step 1: Add disabled styles**

Add after `.series-chip.adaptive-target`:
```css
.series-chip.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.series-chip.disabled .chip-menu-btn {
  pointer-events: none;
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /home/crispy/edatime/frontend && npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

---

## Task 3: Update columnsController.ts to use SeriesChip

**Files:**
- Modify: `frontend/src/features/timeseries/columnsController.ts`

- [ ] **Step 1: Add import**

```typescript
import { SeriesChip } from '../../components/molecules/SeriesChip.js';
```

- [ ] **Step 2: Replace inline chip HTML with SeriesChip**

In `buildColumnToggles()`, replace the inline chip building (lines 195-287) with `SeriesChip()` calls:
- Keep checkbox event → `onToggle` callback
- Keep color input event → `onColorInput` callback  
- Keep menu button click → `onMenuClick` callback (opens filter modal)

- [ ] **Step 3: Run tests**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 4: Commit**

---

## Task 4: Update fftPage.ts to use SeriesChip

**Files:**
- Modify: `frontend/src/pages/fftPage.ts`

- [ ] **Step 1: Add import and replace chip creation**

In `renderChips()` function:
- Import `SeriesChip` from `../components/molecules/SeriesChip.js`
- Replace `document.createElement('div')` + innerHTML pattern with `SeriesChip()`
- `onToggle(true)` → add trace via `fetchAndAddTrace()`
- `onToggle(false)` → remove trace via filter
- `onMenuClick()` → remove trace (menu = delete action)

- [ ] **Step 2: Run tests**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run src/pages/fftPage.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

---

## Task 5: Update causalPage.ts to use SeriesChip

**Files:**
- Modify: `frontend/src/causal/causalPage.ts`

- [ ] **Step 1: Add import and replace chip creation**

In `renderColumnChips()` function:
- Import `SeriesChip` from `../components/molecules/SeriesChip.js`
- Replace inline chip with `SeriesChip()`:
  - `onToggle(checked)` → toggle column in `_selectedColumns`
  - `onColorInput(color)` → update `_chipColors` and re-render graph
  - `onMenuClick()` → open edit panel via `openEditPanel({ kind: 'node', col })`
- Add `causal-chip-nonnumeric` class for non-numeric columns

- [ ] **Step 2: Run tests**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run src/causal/causalPage.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

---

## Task 6: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `cd /home/crispy/edatime/frontend && npm test -- --run`
Expected: All pass, no regressions

- [ ] **Step 2: Commit**

---

## Spec Coverage

- [x] Unified SeriesChip with toggle — Task 1
- [x] Color selection — Task 1
- [x] Optional three-dot menu — Task 1
- [x] disabled state — Tasks 1, 2
- [x] Timeseries migration — Task 3
- [x] FFT migration — Task 4
- [x] Causal migration — Task 5
