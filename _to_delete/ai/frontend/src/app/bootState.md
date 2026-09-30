# ai/frontend/src/app/bootState.md
> Startup-ready flag and body busy-state toggles for the top-level app shell.

## Functions
- `markAppReady(): void`
  - Sets `document.documentElement[data-app-ready="true"]` and clears `aria-busy` on `document.body`.
- `resetAppReady(): void`
  - Removes the app-ready flag and sets `aria-busy="true"` on `document.body`.
