# frontend/src/pages/shared/analysisPageRuntime.test.ts
> Verifies the shared analysis page runtime wires lifecycle callbacks, export binding, and empty-state updates correctly.

## Suite: `describe('createAnalysisPageRuntime', () => void)` [deps: [createAnalysisPageRuntime][1]]
- Groups runtime lifecycle and controller wiring coverage around the shared page factory.

## Tests
- `it('mount() returns an unregister function and wires createPageLifecycle', () => void)`
  - Verifies `mount()` returns a cleanup function and defers `init` until the matching page activates.
- `it('mount() wires exportConfig when provided', async () => Promise<void>)` [deps: [bindExportButtons][2]]
  - Verifies export button wiring is installed when `exportConfig` is present.
- `it('mount() calls onVisible once when the registered page becomes active', () => void)`
  - Verifies `onVisible` fires once when the registered page becomes active.
- `it('updateEmptyState forwards the view model to the empty-state controller', () => void)` [deps: [createEmptyStateController][3]]
  - Verifies `updateEmptyState` forwards the provided view model into the DOM-backed empty-state controller.
- `it('updateEmptyState is idempotent (no double-init of the controller)', () => void)` [deps: [createEmptyStateController][3]]
  - Verifies repeated empty-state updates reuse a single controller instance.
- `it('onEveryPageChange callback fires on every page change', () => void)`
  - Verifies `onEveryPageChange` runs for every page-change event, not just the registered page.

---
[1]: ./analysisPageRuntime.md
[2]: ../../utils/bindExportButtons.md
[3]: ../../ui/emptyState.md
