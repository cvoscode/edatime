# ai/frontend/src/pages/fftHelp.md
> Page-level "?" help content for the FFT / PSD page. Wired from `initFftPage` via `initFftHelp`.

## Constants
- `FFT_HELP: PageHelpContent`
  - Sections: "Display segment", "Pre-scaling segment", "FFT chart", "Export", "How the help button works".
  - Pre-scaling covers Normalize (none / min-max [0,1] / z-score) and Outliers (percentile / IQR).
  - Shortcuts include `⌥6`, `?`, `Ctrl+K`.

## Functions
- `initFftHelp(): void`
  - Calls `initPageHelp('fft', FFT_HELP)`.

---
[1]: ../ui/pageHelp.md