/**
 * store/appStateCompat — explicit backward-compatibility surface for appState.
 *
 * Re-export directly from `store/index.ts` so lazy-loaded chunks do not
 * pull `state.ts` into a circular chunk graph during production builds.
 *
 * New code should import sub-states directly from `store/index.js` for
 * all state operations. This module is intentionally thin — it is NOT a
 * new state layer.
 */
export { appStateComposite as appState } from './index.js';
