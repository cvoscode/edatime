# ai/frontend/src/store/appStateCompat.md
> Explicit backward-compatibility surface for `appState`. Re-exports `appState` from `./index.js` as `appStateComposite as appState`. The previous shim that re-exported from a standalone `state.js`/`state.ts` was archived to `frontend/src/legacy/state.ts`; this file now re-exports directly from the canonical store to avoid circular chunk graphs in Vite production builds.

## Exports
- `appState` — re-exported from `./index.js` (the composite store, not a new state layer).

## Notes
- This module is intentionally thin: it is a re-export shim, not a new state surface.
- New code should import sub-states directly from `store/index.js`.
- The architecture check (`scripts/check-frontend-architecture.mjs`) explicitly allows this file to import from `index.js`.

---
[1]: ./index.md
