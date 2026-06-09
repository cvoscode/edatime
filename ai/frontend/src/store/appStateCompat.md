# ai/frontend/src/store/appStateCompat.md
> Explicit backward-compatibility surface for `appState`. Re-exports `appState` from `../state.js` (the same module that defines `appStateComposite`) so legacy `state.ts` imports and explicit `appStateCompat` imports resolve to the same module. This keeps Vite from putting the composite in two different chunks, which would otherwise produce a "the following dependencies are imported but not used" / circular chunk warning.

## Exports
- `appState` — re-exported from `../state.js` (the composite store, not a new state layer).

## Notes
- This module is intentionally thin: it is a re-export shim, not a new state surface.
- New code should import sub-states directly from `store/index.js`.
- The architecture check (`scripts/check-frontend-architecture.mjs`) explicitly allows this file to import from `state.js`.

---
[1]: ../../state.js
[2]: ./index.md
