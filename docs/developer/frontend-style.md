# Frontend TypeScript Style Guide

Conventions for TypeScript under `frontend/src/`. It has three parts:

- **Rules** the checks enforce. They are listed in `AGENTS.md` and only linked here.
- **Conventions** the codebase already follows, taken from the current code.
- **Practices** adopted from general TypeScript guidance, marked *(adopted)*.

Where the existing code falls short of a rule, that is stated. New and touched
code should follow the rule. Don't copy the old pattern.

Formatting: 4 spaces, single quotes, semicolons, trailing commas in multi-line
literals. There is no Prettier or ESLint config, so match the surrounding file.
`make check-frontend` (`tsc`, architecture, reachability, hygiene) is the gate.

## 1. Compiler and types

`tsconfig.json` sets `strict`, `isolatedModules`, `moduleResolution: bundler`,
and target ES2022. Types are checked only. Vite does the build.

- **No `any`.** Use `unknown` at trust boundaries (JSON, `catch`, `postMessage`,
  storage) and narrow it. Around 38 non-test files still contain `any`. Don't add
  to that count, and remove `any` when you touch a file.
- **No `@ts-ignore`.** Use `@ts-expect-error` with a reason if you must suppress.
  There is currently one suppression in non-test code.
- **`interface` for object shapes, `type` for unions, aliases, and mapped or
  utility types.** Both are used widely. Follow this split.
- **Model states as discriminated unions, not optional-field bags.** *(adopted)*

  ```ts
  // Yes
  type FftState =
      | { status: 'idle' }
      | { status: 'loading'; startedAt: number }
      | { status: 'error'; message: string }
      | { status: 'ready'; traces: FftTrace[] };

  // No: five booleans and optional fields that can contradict each other
  let computing = false; let error = ''; let traces: FftTrace[] = [];
  ```

  Close `switch` statements over a union with an exhaustiveness check
  (`const _never: never = state;`).
- **No `enum`.** There are none in the repo. Use a string-literal union or an
  `as const` object.
- **No classes unless they wrap an imperative resource** (charts, renderers such
  as `FftChart`). Everything else is a factory function returning an object
  literal, like `createLifecycleScope()` and `createRequestTask()`.
- **Prefer `satisfies` to `as` for checking literals** *(adopted)*.
  `as` is acceptable for DOM lookups (`getEl<T>()`) and for a `never`-checked
  narrowing. It is not acceptable to force a shape onto network data. Validate
  or use the generated DTO.
- **Annotate exported functions fully (parameters and return type). Let inference
  work inside function bodies.** This matches the current code.
- **Use `import type` or inline `type` for type-only imports** (`import { fetchX,
  type ApiX } from ...`). This is required by `isolatedModules` and keeps chunks lean.
- **Read `unknown` errors safely.** Use `error instanceof Error ? error.message :
  String(error)`. Avoid `(e as Error).message`, which appears in a few places
  such as `services/api/http.ts`.
- **Array indexing is not checked** (`noUncheckedIndexedAccess` is off). After
  `arr[i]`, handle `undefined` yourself when the index isn't provably in range.

## 2. Modules and imports

- **Relative imports with an explicit `.js` extension**
  (`'./fftBudget.js'`), even though the source is `.ts`. Every import in the repo
  does this. Bare specifiers are used only for packages.
- **Named exports only.** There is one `export default` in the tree. Don't add more.
- **Each feature folder has an `index.ts` that is its public surface**
  (`features/fft/index.ts` exports `initFftPage` and `disposeFftPage`). Other
  code, including other features, imports from that surface, never a feature's
  internal files. `check-frontend-architecture.mjs` enforces this; its only
  exception is an allowlist for the heatmap's pair previews, which reuse Pair plot
  matrix modules. API response types belong in `contracts/api/v1/`, not in a
  feature's view models, so any feature can use them.
- **Import order:** services and contracts, then feature-local modules, then
  types, then side-effect imports such as `./fft.css`. The exact order is loose in
  practice. Keep imports grouped, and don't scatter them through a file.
- **Dynamic `import()` for heavy or rare code** (echarts, apache-arrow, export
  provenance). Do not statically import these from the startup shell. See
  `AGENTS.md`.
- **No cycles.** Depend downward: `features` → `platform`, `ui`, `utils`,
  `services`, `workspace` → `contracts`. A utility must not import a feature.
- **One responsibility per file, named for it.** Examples are `fftBudget.ts`,
  `fftControls.ts`, `fftTraceModel.ts`, and `fftFilterRequest.ts`. Small files
  are the norm.

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| Files (modules) | `camelCase.ts`, prefixed by feature | `fftTraceModel.ts` |
| Files exporting a class or UI primitive | `PascalCase.ts` | `FftChart.ts`, `Dropdown.ts` |
| Tests | beside the module, `*.test.ts` | `fftBudget.test.ts` |
| Functions, variables | `camelCase`, verb-first for functions | `buildFftTrace` |
| Types, interfaces, classes | `PascalCase`, no `I` prefix | `PageLifecycleOptions` |
| Constants | `UPPER_SNAKE_CASE` for module-level literals | `FFT_FALLBACK_BUDGET` |
| Factories | `create…` | `createRequestTask` |
| Pure model builders | `build…` / `resolve…` / `validate…` | `resolveFftPointBudget` |
| Mount and unmount | `init…Page` / `dispose…Page` | `initFftPage` |
| Booleans | `is`, `has`, `can`, or a state noun | `disposed`, `fftComputing` |
| Numeric literals | `_` separators when ≥ 5 digits | `131_072` |
| Unused parameters | leading `_` | `_event` |

Include units in names when they are not obvious (`delayMs`, `sampleRateHz`).

## 4. Functions and data flow

- **Split pure logic from DOM code.** `fftBudget.ts`, `fftControls.ts`, and
  `fftTraceModel.ts` take data and return data. `page.ts` reads the DOM and calls
  them. A module that is DOM-free can be unit-tested without a fixture.
- **Prefer early returns to nesting.** Guard clauses are the dominant style.
- **Avoid boolean-flag parameters.** Pass an options object with named fields
  (`fetchCapabilities({ signal })`).
- **Immutable by default.** Use `const`, `readonly` on public interface fields
  (`LifecycleScope.signal`), and spread or `.map` to update. Clone before storing
  or returning shared state (`cloneSnapshot()` in `workspaceStore.ts`).
- **Use `?.` and `??`. Don't use `||` for defaults**, because it swallows `0` and
  `''`. Validate numbers with `Number.isFinite`, as in `resolveFftPointBudget`.
- **Use `void` on deliberately un-awaited promises** (`void import(...)`).
  A floating promise without `void` is a bug.
- **Comments say why.** Doc-comment (`/** */`) exported functions and non-obvious
  invariants. Don't narrate code. Comments should explain a constraint, such as
  "older backends may not expose capabilities, so fall back conservatively".

## 5. State ownership

- **Cross-feature state (dataset, selection, filters, viewport) lives only in
  `workspace/workspaceStore.ts`.** Read it through the `WorkspaceStore` interface.
  Take it as a dependency, using `Pick<WorkspaceStore, 'getSnapshot'>` to say
  what you need (see `FftPageDeps`).
- **`src/store/` is for local UI and renderer state only.** Do not add imports of
  legacy store modules.
- **Inject dependencies through an options or `deps` object.** Don't reach for
  globals. This is what makes features testable.
- **No new module-level mutable state.** `AGENTS.md` requires disposable
  instances. Follow `features/fft/page.ts`, `features/heatmap/page.ts`, or
  `features/spectrogram/page.ts`: `init…Page()` disposes any previous instance,
  calls a `mount…Page(deps)` closure that owns all page state, and returns that
  instance's disposer. The module keeps only the active instance's disposer and,
  where a behaviour needs it, a documented carry-over value (FFT's
  `recomputeOnNextVisit`). Toolbar controls outlive an instance, so read a
  display choice back from its control rather than from module state. Pair plot
  (`features/scatter/`) still uses module and store flags and is the remaining
  migration.
- Persist UI preferences in `localStorage` under an `edatime_<feature>_<thing>`
  key. Wrap access in `try/catch`, because storage can throw.

## 6. Lifecycle and cleanup

Every feature mounts as an instance and releases everything on dispose.

- **Use `createLifecycleScope()`** (`platform/lifecycleScope.ts`) for anything
  that needs cleanup: `scope.listen(...)`, `scope.timeout(...)`, `scope.add(fn)`.
  It is idempotent, aborts in-flight work first, and still runs every cleanup if
  one throws.
- **Use `createPageLifecycle()`** for init-once and react-on-navigation wiring.
- **Use an `AbortSignal` for listeners and requests.**
  `addEventListener(type, fn, { signal })` removes the listener on abort with no
  bookkeeping *(adopted)*.
- **Requests:** use `createRequestTask()` for "latest request wins" flows. It
  aborts the previous request and uses a run-token so a superseded run can't clear
  loading state or show a stale error.
- **Treat `AbortError` as not-an-error.** Don't toast it, and don't clear loading
  state for a superseded run. When you catch, rethrow if `signal.aborted`, as in
  `fetchFftPointBudget`.
- **Dispose charts, observers, timers, and object URLs** (`URL.revokeObjectURL`).
  Charts are imperative resources. Create them lazily and destroy them in dispose.

## 7. API and errors

- **`fetch` only in `services/api/`.** Add the route to `contracts/api-v1.json`
  first, then the generated types, then the client function. See "Changing the API"
  in `AGENTS.md`.
- **Use DTOs from `contracts/api/v1/`.** Don't hand-write response shapes in
  features, and don't edit `generated.ts`.
- **Every client function accepts `{ signal }`.**
- **Handle errors at the feature boundary, not in the client.** The client
  throws. The feature decides between toast, inline message, or fallback.
- **Every async view has visible loading, error, empty, and stale states**
  (the AGENTS.md UI/UX rule). An empty `catch {}` needs a comment saying why
  swallowing is safe. A few exist in `services/api/scatter.ts`. Don't add more
  without one.
- **Diagnostics go through `debug.ts`** (`dbg`, gated by `?debug=1`). Don't leave
  `console.log` or `console.debug` in production paths. `console.error` and
  `console.warn` are fine for real failures (chart init, bootstrap, renderer
  fallback) that support needs to see, but they never replace a visible
  error state for the user.

## 8. DOM and UI

- **Query once, type the result, handle `null`.** Use
  `document.querySelector<HTMLButtonElement>('#x')` or `getEl<T>()`, and return
  early if missing. Don't use `!` on document lookups, because markup can be
  absent and a throw halfway through a render leaves the page half-updated.
  `!` on a child of an element the same function just built is acceptable.
- **Build with the shared primitives in `ui/` and `ui/primitives/`**
  (`Dropdown`, `FlexibleNumberInput`, chip lists) before writing new markup
  helpers.
- **Escape untrusted text.** Use `textContent` for user or dataset strings (column
  names, file names). If you must build HTML, run values through `escapeHtml()`.
  Never assign a dataset value to `innerHTML` unescaped.
- **Show and hide with the `hidden` attribute** and toggle state with
  classes or `data-*` attributes. `layout.css` has a global
  `[hidden] { display: none !important; }`, so `hidden` always wins, and an
  inline `display` on the same element can only cause trouble (an element whose
  markup starts `hidden` can never be revealed by setting `style.display`).
  The exception is overlays built and positioned in JavaScript (drag-selection
  boxes, text overlays), which set `style.display` next to their other inline
  geometry.
- **Static markup goes in `frontend/index.html`.** Dynamic markup goes in small
  render functions that return or fill a container. Many tests assert against
  `index.html`, so update them with markup changes.
- **Accessibility is a requirement.** Everything works from the keyboard. Use real
  `<button>` and `<label>` elements, and add `aria-*` where semantics aren't
  native. Use `utils/a11y.ts` helpers. Announce async status changes in a live
  region.
- **CSS:** plain CSS in `frontend/css/modules/` (or feature-local, such as
  `fft.css`), using tokens from `tokens.css`. No hard-coded colours or control
  heights (`var(--ctrl-h)`, `var(--surface-1)`). No CSS-in-JS.

## 9. Performance

- Keep the startup bundle small. Heavy libraries load through
  `app/pageModules.ts` or dynamic `import()`. `make check-frontend` enforces
  budgets.
- Handle large series by asking the server for downsampled or budgeted data
  (`resolveFftPointBudget`). Don't pull everything into the browser and thin it
  there.
- Debounce input-driven recomputation with `scope.timeout`. Cancel the previous
  request when a new one starts.
- Prefer typed arrays and Arrow columns over arrays of objects for numeric data.

## 10. Testing

- **Vitest with happy-dom.** Put `name.test.ts` beside `name.ts`. Import from
  `vitest` explicitly (`describe`, `it`, `expect`), as the existing tests do.
- **Test pure modules directly.** That is the point of the split in section 4.
- **Test names state the behaviour**, not the function
  (`'falls back conservatively when capabilities are absent or invalid'`).
- Cover the edge cases the code guards against: `undefined`, `NaN`, `0`, empty
  arrays, aborted signals.
- Use fake timers for debounces. Do not `await` real time.
- A test that fails after a change means the code or the test was wrong. Work out
  which one before editing the test to pass.
- Browser behaviour that happy-dom can't model (WebGPU, layout) goes in
  Playwright specs in `tests/e2e_*_tests.ts`.

## 11. Checklist before you push

- [ ] `make check-frontend` and `make test-frontend` pass
- [ ] No new `any`, `@ts-ignore`, `enum`, default export, or module-level mutable
      state
- [ ] `.js` extensions on relative imports. `import type` for types.
- [ ] Listeners, timers, requests, and charts are released in `dispose`
- [ ] Loading, error, empty, and stale states are visible
- [ ] Pure logic is in a DOM-free module with a test beside it
- [ ] Colours and sizes come from `tokens.css`
- [ ] Dataset strings are never inserted as HTML

## Sources

General practices marked *(adopted)* are drawn from:

- [TypeScript Style Guide (mkosir)](https://mkosir.github.io/typescript-style-guide/)
- [TypeScript best practices: strict mode, discriminated unions, `satisfies`](https://github.com/ofershap/typescript-best-practices)
- [TypeScript Best Practices for Production Code in 2026](https://dev.to/_d7eb1c1703182e3ce1782/typescript-best-practices-for-production-code-in-2026-lb0)
- [Using AbortController as an alternative for removing event listeners (CSS-Tricks)](https://css-tricks.com/using-abortcontroller-as-an-alternative-for-removing-event-listeners/)
- [AbortController beyond fetch: timeouts, cleanup, signal composition](https://www.jamdesk.com/blog/abortcontroller-javascript-guide)
