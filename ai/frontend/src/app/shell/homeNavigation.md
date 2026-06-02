# ai/frontend/src/app/shell/homeNavigation.md
> Wires click handlers on `[data-home-nav]` elements to navigate to a target page.

## Functions
- `wireHomeNavigationCards(showPage: (page: string) => void): void`
  - Queries all `[data-home-nav]` elements and attaches a click listener that calls `showPage(target)`.

---
[1]: ../app.md#initAppShell