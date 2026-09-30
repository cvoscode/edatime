# ai/frontend/src/app/shell/themeToggle.md
> Initializes the dark/light theme toggle button, syncing icon visibility and `data-theme` attribute.

## Functions
- `initThemeToggle(): void`
  - Reads saved theme from `localStorage` and `prefers-color-scheme`; applies `data-theme="light"` or removes it for dark; syncs icon visibility (`theme-icon-dark`, `theme-icon-light`); listens for system changes and user clicks to toggle.

---
[1]: ../app.md#initAppShell