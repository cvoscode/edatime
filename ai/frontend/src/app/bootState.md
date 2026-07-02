# ai/frontend/src/app/bootState.md
> Startup-ready flag and loading-overlay visibility for the top-level app shell.

## Functions
- `markAppReady(): void`
  - Sets `document.documentElement[data-app-ready="true"]` and hides `#app-loading-overlay`.
- `resetAppReady(): void`
  - Removes the app-ready flag and reveals `#app-loading-overlay`.
