/**
 * store/appStateCompat — explicit backward-compatibility surface for appState.
 *
 * Re-exports the composite from store/index.js so that modules migrating away
 * from ../state.js can use a stable, documented import path.
 *
 * New code should import sub-states directly from store/ for all state operations.
 * This module is intentionally thin — it is NOT a new state layer.
 */
export { appStateComposite as appState } from './index.js';
