# ai/frontend/src/ui/settingsHelp.md
> Page-level "?" help content for the Settings modal. The trigger button lives inside the settings modal header (not a page section).

## Constants
- `SETTINGS_HELP: PageHelpContent`
  - Sections: "Appearance tab", "Export tab", "Analytics tab", "Causal tab", "How the help button works".
  - Covers theme/density, default export format, correlation metric, color scale defaults.

## Functions
- `initSettingsHelp(): void`
  - Calls `initPageHelp('settings', SETTINGS_HELP)`.

---
[1]: ./pageHelp.md
[2]: ./settingsPanel.md