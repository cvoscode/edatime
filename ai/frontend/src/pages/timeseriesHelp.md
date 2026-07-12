# ai/frontend/src/pages/timeseriesHelp.md
> Page-level "?" help content for the Timeseries page. Wired from `analysis-controls` subsystem via `initTimeseriesHelp`.

## Constants
- `TIMESERIES_HELP: PageHelpContent`
  - Sections: "Command bar (top)", "Utility shelf (Draw / Labels / Notes / Export / Analytics / Zoom / Quick range)", "Chart area", "Overlays", "How the help button works".
  - Shortcuts include `⌥2`, `?`, `Ctrl+click`, `P`, `E`, `Ctrl+Z`, `Shift+C`, `Ctrl+K`.
  - Tips cover starting columns, Ctrl+click chip targeting, Quick range UTC anchoring, save-session, and WebGPU fallback.

## Functions
- `initTimeseriesHelp(): void`
  - Calls `initPageHelp('timeseries', TIMESERIES_HELP)`.

---
[1]: ../ui/pageHelp.md