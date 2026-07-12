# ai/frontend/src/pages/uploadPage.md
> Upload page wiring. Hosts the "?" help button alongside the existing File / Database / preview / profile machinery in `ui/upload.ts` and `features/upload/*`.

## Constants
- `UPLOAD_HELP: PageHelpContent`
  - Sections: "File tab", "Database tab", "Preview & profile grid", "What happens at ingest", "How the help button works".
  - Shortcuts cover `⌥1`, `⌥2`, `Ctrl+K`, `Ctrl+S`, `?`.

## Functions
- `initUploadHelp(): void`
  - Calls `initPageHelp('upload', UPLOAD_HELP)`.

---
[1]: ../ui/pageHelp.md
[2]: ../ui/upload.md