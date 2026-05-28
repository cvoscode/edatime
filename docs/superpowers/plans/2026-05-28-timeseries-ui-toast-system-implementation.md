# Timeseries UI Refresh and Toast System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Timeseries workspace layout so controls do not overlap and migrate transient app notifications onto a shared compact toast system, including upload success feedback.

**Architecture:** Keep the existing Timeseries behavior modules intact, but reshape the page into a command bar plus utility shelf with tighter grouping and overflow rules. Upgrade `frontend/src/utils/toast.ts` into the opinionated notification entry point, then migrate transient upload and database messages to it while preserving inline progress and persistent page-state labels.

**Tech Stack:** Vite, TypeScript, Vitest, Happy DOM, static HTML/CSS modules

---

## File Map

- Modify: `frontend/index.html`
  - Restructure the Timeseries top controls into stable left/center/right command areas and grouped utility shelf clusters.
- Modify: `frontend/css/modules/toolbar.css`
  - Add layout rules for the new Timeseries command bar and utility shelf, including non-overlapping group sizing.
- Modify: `frontend/css/modules/chips.css`
  - Stabilize chip rail sizing, scrolling, and color-by panel treatment.
- Modify: `frontend/css/modules/responsive.css`
  - Add breakpoint rules so the Timeseries controls wrap intentionally instead of colliding.
- Modify: `frontend/css/modules/toast.css`
  - Restyle the toast container/cards to compact top-right product toasts.
- Modify: `frontend/src/utils/toast.ts`
  - Add severity defaults, duplicate refresh handling, and keep the old `toast(...)` signature working.
- Create: `frontend/src/utils/toast.test.ts`
  - Verify severity defaults, container placement, and duplicate suppression/refresh.
- Modify: `frontend/src/ui/upload.ts`
  - Route upload and database transient outcomes through the toast controller while keeping inline progress status.
- Modify: `frontend/src/ui/upload.test.ts`
  - Add upload notification tests and keep the existing helper coverage.
- Create: `frontend/src/pages/timeseriesLayout.test.ts`
  - Guard the Timeseries HTML structure and responsive CSS hooks used by the refreshed layout.

### Task 1: Toast Controller Foundation

**Files:**
- Create: `frontend/src/utils/toast.test.ts`
- Modify: `frontend/src/utils/toast.ts`
- Modify: `frontend/css/modules/toast.css`

- [ ] **Step 1: Write the failing toast controller tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissAllToasts, toast } from './toast';

describe('toast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        dismissAllToasts();
        vi.useRealTimers();
    });

    it('renders the container in the top-right stack', () => {
        toast('Dataset ready', 'success');
        const container = document.querySelector('.toast-container');
        expect(container).not.toBeNull();
        expect(container?.getAttribute('data-position')).toBe('top-right');
    });

    it('keeps error toasts sticky by default', () => {
        toast('Upload failed', 'error');
        vi.advanceTimersByTime(10_000);
        expect(document.querySelectorAll('.toast').length).toBe(1);
    });

    it('refreshes matching toasts instead of stacking duplicates', () => {
        toast('Session restored', 'success');
        toast('Session restored', 'success');
        expect(document.querySelectorAll('.toast').length).toBe(1);
    });
});
```

- [ ] **Step 2: Run the toast test to verify it fails**

Run: `npm test -- frontend/src/utils/toast.test.ts`
Expected: FAIL because `dismissAllToasts` does not exist and the container does not expose top-right/duplicate behavior yet.

- [ ] **Step 3: Implement the minimal toast controller upgrade**

```ts
const DEFAULT_DURATIONS: Record<ToastKind, number> = {
    success: 3200,
    info: 3600,
    warning: 5200,
    error: 0,
};

const duplicateKey = `${kind}:${message}`;
const existing = activeToasts.get(duplicateKey);
if (existing && existing.isConnected) {
    existing.refresh(kind, opts);
    return existing.dismiss;
}
```

- [ ] **Step 4: Restyle the toast UI for the compact top-right stack**

```css
.toast-container {
  top: 20px;
  right: 20px;
  bottom: auto;
  display: grid;
  gap: 10px;
}

.toast {
  min-width: 300px;
  max-width: min(360px, calc(100vw - 32px));
}
```

- [ ] **Step 5: Run the toast test to verify it passes**

Run: `npm test -- frontend/src/utils/toast.test.ts`
Expected: PASS

### Task 2: Upload and Database Notification Migration

**Files:**
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/ui/upload.test.ts`

- [ ] **Step 1: Write the failing upload notification tests**

```ts
it('shows a success toast after upload metadata refresh', async () => {
    const toast = vi.fn();
    // mock uploadDataset + fetchMetadata to succeed
    // mount minimal upload DOM, click #upload-btn, await promises
    expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('rows loaded'),
        'success',
        expect.anything(),
    );
});

it('shows an error toast when database connect fails', async () => {
    const toast = vi.fn();
    // mock connectDatabase to reject, click #db-connect-btn
    expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Connection'),
        'error',
        expect.anything(),
    );
});
```

- [ ] **Step 2: Run the upload test to verify it fails**

Run: `npm test -- frontend/src/ui/upload.test.ts`
Expected: FAIL because upload/database outcomes currently only update inline status text.

- [ ] **Step 3: Implement toast-backed transient feedback while keeping inline progress**

```ts
function notifyUploadSuccess(rowCount: number): void {
    toast(`${formatCount(rowCount)} rows loaded. Dataset ready.`, 'success');
}

function notifyUploadError(message: string): void {
    toast(message, 'error');
}
```

- [ ] **Step 4: Route database connect/load/disconnect event feedback through the same controller**

```ts
toast('Database connected. Choose a table to load.', 'success');
toast(`Database load failed: ${e.message}`, 'error');
toast('Database disconnected.', 'info');
```

- [ ] **Step 5: Run the upload test to verify it passes**

Run: `npm test -- frontend/src/ui/upload.test.ts`
Expected: PASS

### Task 3: Timeseries Markup and CSS Refresh

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/css/modules/toolbar.css`
- Modify: `frontend/css/modules/chips.css`
- Modify: `frontend/css/modules/responsive.css`
- Create: `frontend/src/pages/timeseriesLayout.test.ts`

- [ ] **Step 1: Write the failing layout guard tests**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');

it('uses a dedicated timeseries command bar shell', () => {
    expect(indexHtml).toContain('timeseries-command-bar');
    expect(indexHtml).toContain('timeseries-chip-rail');
});

it('gives the command bar stable wrapping rules', () => {
    expect(toolbarCss).toContain('.timeseries-command-bar');
    expect(toolbarCss).toContain('.timeseries-utility-shelf');
});
```

- [ ] **Step 2: Run the layout test to verify it fails**

Run: `npm test -- frontend/src/pages/timeseriesLayout.test.ts`
Expected: FAIL because the refreshed structure/classes do not exist yet.

- [ ] **Step 3: Update the Timeseries HTML structure**

```html
<div class="toolbar toolbar--series timeseries-command-bar">
  <div class="timeseries-command-bar__left">…</div>
  <div class="timeseries-command-bar__center">…</div>
  <div class="timeseries-command-bar__right">…</div>
</div>
<div class="toolbar toolbar--tools timeseries-utility-shelf">…</div>
```

- [ ] **Step 4: Add scoped toolbar/chip/responsive CSS**

```css
.timeseries-command-bar {
  min-height: 68px;
  align-items: stretch;
  gap: 16px;
}

.timeseries-chip-rail {
  min-width: 0;
  overflow-x: auto;
}
```

- [ ] **Step 5: Run the layout test to verify it passes**

Run: `npm test -- frontend/src/pages/timeseriesLayout.test.ts`
Expected: PASS

### Task 4: Full Verification

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/css/modules/toolbar.css`
- Modify: `frontend/css/modules/chips.css`
- Modify: `frontend/css/modules/responsive.css`
- Modify: `frontend/css/modules/toast.css`
- Modify: `frontend/src/utils/toast.ts`
- Modify: `frontend/src/ui/upload.ts`
- Create: `frontend/src/utils/toast.test.ts`
- Modify: `frontend/src/ui/upload.test.ts`
- Create: `frontend/src/pages/timeseriesLayout.test.ts`

- [ ] **Step 1: Run the focused frontend tests**

Run: `npm test -- frontend/src/utils/toast.test.ts frontend/src/ui/upload.test.ts frontend/src/pages/timeseriesLayout.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/pages/fftPage.test.ts`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Verify the Timeseries page in a browser**

Run: `npm run dev`
Expected: a dev server URL that renders the refreshed Timeseries toolbar without overlap and shows upload success/error toasts in the top-right stack.

- [ ] **Step 4: Capture the final diff**

Run: `git status --short`
Expected: only the intended plan, layout, toast, and test files changed.

## Self-Review

- Spec coverage: layout refresh, top-right toast system, upload success toast, and migration of transient upload/database feedback are all mapped to tasks.
- Placeholder scan: no `TODO`/`TBD` placeholders remain.
- Type consistency: the plan keeps the existing `toast(message, kind, opts)` call pattern and uses explicit new helper names only inside `upload.ts`.
