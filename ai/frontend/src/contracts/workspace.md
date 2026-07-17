# frontend/src/contracts/workspace.ts
> Workspace-level TypeScript contracts — shared types for the in-app workspace
> store (datasets, panels, layouts, recent runs) consumed by both `frontend/src/workspace/*`
> and feature pages.

This is the canonical contract source for workspace state; page-level types
must import from here to keep cross-feature payload shapes consistent.
