# Timeseries UI Refresh and App-Wide Toast System Design

Date: 2026-05-28
Project: EdaTime
Scope: Timeseries page visual redesign, app-wide notification unification, upload success toast
Constraint: Work on the current branch; do not use worktrees

## Goal

Modernize the Timeseries workspace so it reads as a clean analysis surface rather than a crowded toolbar strip, remove layout overlap between controls, and replace the current mixed transient feedback patterns with a single toast-based notification system for success, error, warning, and informational messages.

## Desired Outcome

1. The Timeseries page uses a clearer visual hierarchy with stable layout bands and no overlapping controls.
2. The app uses one shared toast notification system as the primary transient feedback mechanism.
3. Upload success is communicated through the toast system with a clear success message.
4. Existing transient notifications across the app are migrated onto the same toast system.

## Non-Goals

1. Rebuilding non-Timeseries page layouts.
2. Changing chart analysis behavior or data-fetch semantics.
3. Replacing persistent page-state indicators that communicate ongoing state rather than transient events.
4. Broad refactoring unrelated to layout or notification flow.

## Approved UX Direction

### Timeseries Layout

Use the approved `B` direction: command bar plus utility shelf.

The page will be organized into three stable bands:

1. Selection command bar
   - Left: series label, search/filter input, collapse control
   - Center: horizontally scrollable chip rail with stable height
   - Right: color-by control and compact dataset stats

2. Utility shelf
   - Grouped action blocks for Draw, Notes/Labels, Export, Analytics, and Zoom
   - Stable width and spacing rules so controls do not overlap as viewport width changes
   - Zoom/status cluster remains visually separate on the right edge

3. Chart workspace
   - Chart remains the dominant element
   - Overlay cards such as color legends remain in a defined corner stack with explicit spacing

### Toast System

Use the approved `A` direction: compact top-right stack.

The toast system becomes the primary transient notification mechanism for:

1. success
2. error
3. warning
4. info

Behavior defaults:

1. Success and info: auto-dismiss
2. Warning: longer auto-dismiss duration
3. Error: sticky by default until dismissed

The system should reduce duplicate noise by refreshing or merging repeated identical notices within a short interval rather than stacking visually identical messages.

## Information Architecture

### Timeseries Page Structure

The current two-toolbar composition is retained conceptually but rebalanced visually:

1. `toolbar--series` becomes the primary command bar
2. `toolbar--tools` becomes the secondary utility shelf
3. Chip rail, color-by control, and stats are treated as one coordinated surface rather than unrelated inline pieces

This preserves existing page logic while improving ergonomics and scanability.

### Notification Model

Transient feedback must route through a shared notification controller instead of page-local text status for one-off events.

Use inline/persistent page state only when it represents an ongoing condition, for example:

1. database connected/disconnected state
2. in-progress upload progress bar
3. loading overlays tied to active work

Use toasts for event completion and event failure, for example:

1. upload completed
2. upload failed
3. export finished
4. session restored
5. saved range was clamped
6. FFT preview applied

## Technical Design

### Files in Scope

Primary layout files:

1. `frontend/index.html`
2. `frontend/css/modules/toolbar.css`
3. `frontend/css/modules/chips.css`
4. `frontend/css/modules/responsive.css`

Primary notification files:

1. `frontend/src/utils/toast.ts`
2. `frontend/css/modules/toast.css`
3. `frontend/src/ui/upload.ts`

Migration call sites include existing transient uses of `toast(...)` and current inline success/error/warning/info handlers that should become toasts.

### Timeseries Layout Changes

Update the Timeseries markup in `frontend/index.html` so the page expresses:

1. a clear selection command cluster
2. a contained chip rail that can scroll without colliding with adjacent controls
3. a dedicated utility shelf with grouped controls
4. a visually distinct right-side zoom/view-state cluster

CSS changes should:

1. define stable height and spacing for both top bands
2. prevent text and buttons from overlapping at narrower desktop widths
3. preserve responsive wrapping behavior intentionally rather than letting controls collide
4. keep the chip rail usable under overflow

The redesign should stay visually aligned with the existing dark product language instead of introducing a marketing-style surface.

### Toast Controller Changes

`frontend/src/utils/toast.ts` will remain the single app entry point for notifications, but it should be upgraded into a more opinionated controller:

1. severity-based defaults for iconography and dismiss timing
2. compact top-right stack behavior
3. duplicate suppression or refresh for repeated identical messages
4. a consistent message structure that avoids per-call-site styling decisions

`frontend/css/modules/toast.css` should be refined to match the approved compact product style:

1. tighter card sizing
2. better text hierarchy
3. consistent spacing and corner radius
4. clear severity distinction without oversized visual treatment

### Upload Feedback Changes

The upload flow in `frontend/src/ui/upload.ts` should change as follows:

1. keep inline progress UI during active upload
2. emit a success toast after successful upload and metadata refresh
3. emit error toasts for preview/upload failures
4. stop relying on inline transient success copy as the primary success signal

The upload success toast should include useful confirmation, such as row count and dataset-ready wording, without becoming verbose.

## Migration Rules for Existing Notifications

Convert the existing notification surface broadly enough that the app has one notification language.

Migration rule:

1. If feedback is transient and event-based, it should use the toast system.
2. If feedback describes an ongoing state visible in the page itself, it may remain inline.

Examples that should use toast:

1. upload success/failure
2. export success/failure
3. warning conditions such as restored/clamped ranges
4. informational notices such as guided workflow toggles or preview actions

Examples that may remain inline:

1. progress bars
2. active loading overlays
3. persistent database connection state

## Error Handling

The toast controller must handle:

1. repeated messages without unbounded growth
2. manual dismissal for sticky errors
3. safe operation even if the toast container must be recreated

Upload migration must preserve existing backend error messages so users still receive actionable text.

## Testing Strategy

Add focused tests for:

1. toast controller behavior and severity defaults
2. duplicate/refresh behavior if implemented
3. upload success toast emission
4. upload error toast emission where practical
5. Timeseries chip/toolbar DOM expectations that are feasible under the current frontend test setup

Verification after implementation should include:

1. frontend test run for affected toast, upload, and Timeseries modules
2. production build
3. manual/browser verification that Timeseries top controls no longer overlap at the target widths
4. manual/browser verification that upload success appears as a toast

## Risks and Mitigations

### Risk: Layout regression in dense toolbars

Mitigation:

1. keep markup changes scoped to the Timeseries page
2. use explicit grouping and stable dimensions
3. verify desktop-width behavior in browser after build

### Risk: Notification inconsistency during migration

Mitigation:

1. route transient notifications through the shared toast utility
2. avoid leaving parallel inline transient success paths in place

### Risk: Excessively noisy toast stack

Mitigation:

1. define severity defaults
2. suppress or refresh repeated identical messages
3. reserve sticky behavior for errors by default

## Implementation Boundaries

This work should stay on the current branch and should not introduce a worktree-based workflow.

Implementation should remain incremental:

1. establish layout structure
2. establish toast controller behavior
3. migrate upload success/error
4. migrate remaining transient notifications
5. verify build and browser behavior

