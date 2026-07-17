# frontend/src/workspace/
> Workspace-level state and persistence. Keeps state that spans multiple sessions
> or persists across page navigation (open datasets, panel layouts, recent runs).

## Files

| File | Role |
| --- | --- |
| `workspaceStore.ts` | In-memory store with optional localStorage hydration. |
| `workspaceStore.test.ts` | Pinned-behavior tests for the workspace store. |

See `frontend/src/contracts/workspace.ts` for the canonical workspace payload
types.
