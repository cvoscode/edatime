# ai/frontend/src/pages/driftHelp.md
> Page-level "?" help content for the Drift Analysis page. Wired from `initDriftPage` via `initDriftHelp`.

## Constants
- `DRIFT_HELP: PageHelpContent`
  - Sections: "Column picker", "Window and reference", "Thresholds", "Result timeline", "How the help button works".
  - Covers KS / Wasserstein / PSI / ES metrics; sliding vs tumbling windows; segment-by categorical / time.

## Functions
- `initDriftHelp(): void`
  - Calls `initPageHelp('drift', DRIFT_HELP)`.

---
[1]: ../ui/pageHelp.md