# ai/frontend/src/pages/homePage.md
> Home page wiring. Currently minimal: wires the page-level "?" help button via the shared helper.

## Constants
- `HOME_HELP: PageHelpContent`
  - Sections: "What this page is for", "Sections on this page", "How to get started", "How the help button works".
  - Shortcuts cover `⌥1`–`⌥0` page navigation, `Ctrl+K`, `Ctrl+I`, `?`.

## Functions
- `initHomePage(): void`
  - Calls `initPageHelp('home', HOME_HELP)`.

---
[1]: ../ui/pageHelp.md