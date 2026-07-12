/**
 * uploadPage — Upload page wiring.
 *
 * The Upload page has two source tabs (File and Database) and a
 * preview/profiles grid on the right. It already owns a heavy wiring
 * module (`ui/upload.ts` + `features/upload/*`), so this init is
 * intentionally minimal: it only wires the page-level "?" help button.
 *
 * `initUploadHelp` is registered as the `page-help` subsystem in the
 * upload subsystem group so it's loaded the first time the upload
 * panel is initialized. The helper is idempotent so re-entry is safe.
 */

import { initPageHelp, type PageHelpContent } from '../ui/pageHelp.js';

/**
 * Content of the Upload help modal. Two main sections walk through
 * each tab; a third section explains the preview/profile grid; a
 * fourth covers ingest behavior; tips and shortcuts round it out.
 */
export const UPLOAD_HELP: PageHelpContent = {
    pageName: 'Upload',
    intro:
        'Bring data into EdaTime. Pick a File or a Database source, optionally preview and trim columns, then ingest. The active dataset stays in memory until you upload again or load a sample.',
    sections: [
        {
            title: 'File tab',
            body:
                'Drag a CSV or Parquet file into the drop zone, or click "Browse file" to pick one. The upload accepts `.csv` and `.parquet` files up to the configured size limit (see the upload-status text below the button for the current limit).',
            bullets: [
                'Drop zone — accepts a single file at a time; replacing the file clears the previous preview',
                'File name — appears below the drop zone once a file is selected; press the file name area to re-open the picker',
                'Load options — toggle "Partial load" to cap rows, skip leading rows, and (optionally) restrict to a time range',
                'Time column — defaults to Auto-detect; override it if the file has multiple time-like columns',
                'Upload & Ingest — commits the file into the active dataset and loads the Timeseries page when done',
            ],
        },
        {
            title: 'Database tab',
            body:
                'Connect to a PostgreSQL or TimescaleDB instance, pick a table or hypertable, then load it. The connection string follows standard libpq URI form and is never persisted.',
            bullets: [
                'Backend — PostgreSQL or TimescaleDB; both use the same protocol but TimescaleDB enables hypertable-aware metadata',
                'Connection string — `postgres://user:password@host:port/dbname`; use SSH tunnel or VPN for remote hosts',
                'Schema — defaults to `public`; override for custom schemas',
                'Table / Hypertable — pick from the dropdown after connecting, or type the name directly',
                'Time column — required if the table has more than one timestamp-like column; leave blank to auto-detect',
                'Connect → Load data — first test the connection, then stream the table into the active dataset',
            ],
        },
        {
            title: 'Preview & profile grid',
            body:
                'The right pane shows a virtualised profile of the selected source. Each row summarises a column: type, non-null count, null count, min/max for numeric columns, and a small distribution sparkline.',
            bullets: [
                'Selection — check the rows you want to ingest, or use the "All" / "None" buttons; the checkbox in the header toggles every visible row',
                'Type filter — show All, only Numeric, or only Datetime columns to focus on signal-bearing fields',
                'Filter box — type to narrow the column list; matching is case-insensitive substring',
                'Current dataset mode — when no file is selected, the grid mirrors the columns of the active dataset so you can review what is currently loaded',
            ],
        },
        {
            title: 'What happens at ingest',
            body:
                'Pressing "Upload & Ingest" (or "Load data" from the Database tab) replaces the active dataset in the in-memory backend. The page then navigates to the Timeseries page and rebuilds the chart against the new columns. Your previous dataset is gone — there is no undo, so save the session first if you need to keep the old data.',
            bullets: [
                'Server enforces row and size limits; out-of-range requests return a clear error message and the toast surfaces it',
                'Partial loads with a time range only ingest rows whose timestamp falls inside the chosen window',
                'Loading a sample dataset from the Home page replaces the active dataset the same way',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥1', description: 'Open the Upload page (this page)' },
        { keys: '⌥2', description: 'Open the Timeseries page (auto-navigates after a successful upload)' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
        { keys: 'Ctrl+S', description: 'Save the current session, including the active dataset metadata' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
    ],
    tips: [
        'Large files? Enable "Partial load" and set a reasonable "Max rows to load" to test the schema before ingesting the full file.',
        'If the time column is wrong, change it in the dropdown before pressing Upload & Ingest — there is no way to change it afterwards without re-uploading.',
        'The preview grid is virtualised, so it stays responsive even on files with hundreds of columns.',
        'Database connections are stateless: closing the tab or refreshing the page drops the connection; nothing is written to disk.',
    ],
};

export function initUploadHelp(): void {
    initPageHelp('upload', UPLOAD_HELP);
}