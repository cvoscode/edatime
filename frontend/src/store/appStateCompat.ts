/**
 * store/appStateCompat — explicit backward-compatibility surface for appState.
 *
 * Re-exports the composite through `../state.js` so that all consumers
 * (legacy `state.ts` imports and explicit `appStateCompat` imports) end
 * up resolving to the same module. This keeps Vite from putting the
 * composite in two different chunks, which would otherwise produce a
 * "the following dependencies are imported but not used" / circular
 * chunk warning.
 *
 * New code should import sub-states directly from `store/index.js` for
 * all state operations. This module is intentionally thin — it is NOT a
 * new state layer.
 */
export { appState } from '../state.js';
