# ai/frontend/src/pages/causalHelp.md
> Page-level "?" help content for the Causal Discovery page. Wired from `initCausalPage` via `initCausalHelp`.

## Constants
- `CAUSAL_HELP: PageHelpContent`
  - Sections: "Method picker", "Parameter panel", "Column selection", "Graph view", "Export", "How the help button works".
  - Covers PCMCI / PCMCI+ / FullCI / BivCI / LPCMCI; parameters (tau_max, alpha, CI test, verbosity); graph interactions.

## Functions
- `initCausalHelp(): void`
  - Calls `initPageHelp('causal', CAUSAL_HELP)`.

---
[1]: ../ui/pageHelp.md