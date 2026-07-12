# ai/frontend/src/pages/spectrogramHelp.md
> Page-level "?" help content for the Spectrogram page. Wired from `initSpectrogramPage` via `initSpectrogramHelp`.

## Constants
- `SPECTROGRAM_HELP: PageHelpContent`
  - Sections: "Display segment", "Pre-scaling segment", "Spectrogram chart", "Export", "How the help button works".
  - Pre-scaling options mirror the FFT page (normalize + outlier clipping).

## Functions
- `initSpectrogramHelp(): void`
  - Calls `initPageHelp('spectrogram', SPECTROGRAM_HELP)`.

---
[1]: ../ui/pageHelp.md