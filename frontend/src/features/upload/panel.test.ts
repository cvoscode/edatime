/**
 * Tests for frontend/src/features/upload/panel.ts
 *
 * Covers: setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    connectDatabase: vi.fn(),
    deleteDatabaseConnection: vi.fn(),
    fetchDatabaseStatus: vi.fn(),
    fetchDatabaseTables: vi.fn(),
    fetchMetadata: vi.fn(),
    loadDatabaseTable: vi.fn(),
    previewUpload: vi.fn(),
    toast: vi.fn(),
    uploadDataset: vi.fn(),
}));

beforeEach(() => {
    // Reset all mock implementations and call counts between tests
    vi.resetAllMocks();
    mocks.fetchMetadata.mockResolvedValue(makeMetadata());
});

vi.mock('../../services/api/index.js', () => ({
    connectDatabase: mocks.connectDatabase,
    deleteDatabaseConnection: mocks.deleteDatabaseConnection,
    fetchDatabaseStatus: mocks.fetchDatabaseStatus,
    fetchDatabaseTables: mocks.fetchDatabaseTables,
    fetchMetadata: mocks.fetchMetadata,
    loadDatabaseTable: mocks.loadDatabaseTable,
    previewUpload: mocks.previewUpload,
    uploadDataset: mocks.uploadDataset,
}));

vi.mock('../../utils/toast.js', () => ({
    toast: mocks.toast,
}));

import {
    initUploadPanel,
    setUploadPreviewStatus,
    setProfileMode,
    applyPartialTimeRangeFromMetadata,
    formatUploadRowCount,
    loadedRowCountFromResponse,
} from './panel';
import { datasetState } from '../../store/datasetState.js';
import { uiState } from '../../store/uiState.js';
import type { DatasetMetadata } from '../../types/api.js';

function makeMetadata(overrides: Partial<DatasetMetadata> = {}): DatasetMetadata {
    return {
        total_rows: 1234,
        columns: [
            { name: 'timestamp', dtype: 'datetime64[ms]' } as any,
            { name: 'value', dtype: 'float64' } as any,
        ],
        numeric_columns: ['value'],
        time_column: 'timestamp',
        time_range: { min: 1700000000000, max: 1700001000000 },
        column_profiles: [],
        revision: 7,
        ...overrides,
    };
}

function buildUploadDom(): void {
    document.body.innerHTML = `
        <button id="upload-toggle-btn" type="button"></button>
        <div id="upload-panel"></div>
        <button id="browse-btn" type="button"></button>
        <input id="file-upload" type="file" />
        <div id="drop-zone" tabindex="0"></div>
        <span id="file-name-display"></span>
        <input id="partial-enabled" type="checkbox" />
        <div id="partial-fields"></div>
        <input id="n-rows-input" value="1000" />
        <input id="n-rows-range" value="1000" max="1000000" />
        <span id="n-rows-display"></span>
        <input id="skip-rows-input" value="0" />
        <input id="time-start-input" type="datetime-local" />
        <input id="time-end-input" type="datetime-local" />
        <button id="upload-btn" type="button"></button>
        <div id="upload-status"></div>
        <div id="upload-loading" hidden></div>
        <button id="profile-select-all-btn" type="button"></button>
        <button id="profile-select-none-btn" type="button"></button>
        <input id="profile-select-all-checkbox" type="checkbox" />
        <span id="upload-preview-status"></span>
        <span id="profile-mode-badge" data-mode="dataset">Current dataset</span>
        <span id="time-range-hint"></span>
        <select id="time-column-select"></select>
        <button id="upload-source-file-btn" type="button"></button>
        <button id="upload-source-database-btn" type="button"></button>
        <div data-upload-source-panel="file"></div>
        <div data-upload-source-panel="database" hidden></div>
        <button id="db-connect-btn" type="button"></button>
        <button id="db-load-btn" type="button" disabled></button>
        <button id="db-disconnect-btn" type="button" hidden></button>
        <div id="db-status"></div>
        <select id="db-table-select"></select>
        <input id="db-connection-input" />
        <input id="db-schema-input" value="public" />
        <input id="db-table-input" />
        <input id="db-time-col-input" />
        <div id="header-meta"></div>
    `;
}

/**
 * Build a `File` whose reported `size` exceeds the 256 MB upload cap
 * without actually allocating 256 MB in memory. `File.size` is normally
 * derived from the underlying buffer, but happy-dom + jsdom both honour
 * `Object.defineProperty` overrides on the instance, which is exactly
 * what the production `validateFileSize` function reads. Using this
 * helper keeps the test fast while still exercising the size branch.
 */
function makeOversizedFile(name: string, claimedSize = 256 * 1024 * 1024 + 1): File {
    const tooBigFile = new File([''], name, { type: 'text/csv' });
    Object.defineProperty(tooBigFile, 'size', { configurable: true, value: claimedSize });
    return tooBigFile;
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('formatUploadRowCount', () => {
    it('formats small counts without suffixes', () => {
        expect(formatUploadRowCount(512)).toBe('512');
    });

    it('formats thousands with K suffix', () => {
        expect(formatUploadRowCount(4_500)).toBe('5K');
    });

    it('formats millions with M suffix', () => {
        expect(formatUploadRowCount(1_250_000)).toBe('1.3M');
    });
});

describe('loadedRowCountFromResponse', () => {
    it('reads the current database load response rows field', () => {
        expect(loadedRowCountFromResponse({ rows: 42 })).toBe(42);
    });

    it('keeps compatibility with rows_loaded responses', () => {
        expect(loadedRowCountFromResponse({ rows_loaded: 17 })).toBe(17);
    });
});

describe('setUploadPreviewStatus', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="upload-preview-status"></div>';
    });

    it('sets text content', () => {
        setUploadPreviewStatus('Loading…');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.textContent).toBe('Loading…');
    });

    it('applies kind class', () => {
        setUploadPreviewStatus('Ready', 'success');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status success');
    });

    it('clears kind class when empty', () => {
        setUploadPreviewStatus('Neutral');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status');
    });

    it('replaces previous kind class', () => {
        setUploadPreviewStatus('Err', 'error');
        setUploadPreviewStatus('Ok', 'success');
        const el = document.getElementById('upload-preview-status')!;
        expect(el.className).toBe('upload-preview-status success');
        expect(el.textContent).toBe('Ok');
    });

    it('is a no-op when element is missing', () => {
        document.body.innerHTML = '';
        expect(() => setUploadPreviewStatus('noop')).not.toThrow();
    });
});

describe('initUploadPanel notifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
    });

    it('disposes prior panel listeners before a replacement panel is bound', () => {
        const firstDispose = initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });
        firstDispose();
        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        (document.getElementById('upload-toggle-btn') as HTMLButtonElement).click();

        expect(document.getElementById('upload-panel')?.classList.contains('open')).toBe(true);
    });

    it('shows a success toast after upload completes and metadata refreshes', async () => {
        const previewMetadata = makeMetadata();
        const refreshedMetadata = makeMetadata({ total_rows: 2468 });
        const file = new File(['timestamp,value\n2024-01-01T00:00:00Z,1\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;

        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: previewMetadata, preview_rows: 1 }),
        });
        mocks.uploadDataset.mockResolvedValue({
            ok: true,
            json: async () => ({ rows: 2468 }),
        });
        mocks.fetchMetadata.mockResolvedValue(refreshedMetadata);

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        Object.defineProperty(fileInput, 'files', {
            configurable: true,
            value: [file],
        });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('rows'),
            'success',
            expect.anything(),
        );
    });

    it('shows an error toast when database connect fails', async () => {
        mocks.connectDatabase.mockRejectedValue(new Error('bad credentials'));

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const input = document.getElementById('db-connection-input') as HTMLInputElement;
        input.value = 'postgres://user:pass@localhost:5432/db';

        document.getElementById('db-connect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('bad credentials'),
            'error',
            expect.anything(),
        );
    });
});

describe('initUploadPanel upload button state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
    });

    it('keeps Upload & Ingest disabled until a valid file is selected', async () => {
        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
        expect(uploadBtn.disabled).toBe(true);
        expect(uploadBtn.getAttribute('aria-disabled')).toBe('true');
        expect(uploadBtn.title).toContain('Pick a CSV/Parquet file above first.');

        const file = new File(['timestamp,value\n2024-01-01T00:00:00Z,1\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', {
            configurable: true,
            value: [file],
        });
        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
        });

        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        expect(uploadBtn.disabled).toBe(false);
        expect(uploadBtn.getAttribute('aria-disabled')).toBe('false');
        expect(uploadBtn.title).toBe('');
    });
});

describe('initUploadPanel column selection helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
    });

    it('select-all keeps the preview time column while reading profiles from store slices', () => {
        datasetState.columnProfiles = [
            { name: 'timestamp', dtype: 'datetime64[ms]' } as any,
            { name: 'value', dtype: 'float64' } as any,
            { name: 'other', dtype: 'float64' } as any,
        ];
        uiState.previewTimeColumn = 'timestamp';

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        document.getElementById('profile-select-all-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(datasetState.columnProfiles).toHaveLength(3);
        expect(uiState.previewSelectedColumns).toEqual(['timestamp', 'value', 'other']);
        expect(uiState.previewTimeColumn).toBe('timestamp');
    });
});

describe('setProfileMode', () => {
    beforeEach(() => {
        document.body.innerHTML = '<span id="profile-mode-badge" data-mode="dataset">Current dataset</span>';
    });

    it('sets dataset mode', () => {
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Current dataset');
    });

    it('sets preview mode', () => {
        setProfileMode('preview');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('preview');
        expect(el.textContent).toBe('Upload preview');
    });

    it('toggles between modes', () => {
        setProfileMode('preview');
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Current dataset');
    });

    it('is a no-op when element is missing', () => {
        document.body.innerHTML = '';
        expect(() => setProfileMode('preview')).not.toThrow();
    });
});

describe('applyPartialTimeRangeFromMetadata', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="time-start-input" type="datetime-local" />
            <input id="time-end-input" type="datetime-local" />
            <span id="time-range-hint"></span>
        `;
    });

    it('populates inputs from metadata time range', () => {
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        const end = document.getElementById('time-end-input') as HTMLInputElement;
        expect(start.value).not.toBe('');
        expect(end.value).not.toBe('');
        expect(start.min).not.toBe('');
        expect(end.max).not.toBe('');
    });

    it('shows hint when time range is not detected', () => {
        applyPartialTimeRangeFromMetadata(null);
        const hint = document.getElementById('time-range-hint')!;
        expect(hint.textContent).toBe('Time range not detected in this file.');
    });

    it('clears input bounds when metadata has no range', () => {
        const meta: DatasetMetadata = {
            total_rows: 50,
            columns: [],
            numeric_columns: [],
            time_column: null,
            time_range: null,
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        expect(start.min).toBe('');
        expect(start.max).toBe('');
    });

    it('does not overwrite inputs when overwriteInputs is false and values exist', () => {
        const start = document.getElementById('time-start-input') as HTMLInputElement;
        start.value = '2023-01-01T00:00';
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta, false);
        // value should remain as the user's input
        expect(start.value).toBe('2023-01-01T00:00');
    });

    it('is a no-op when inputs are missing', () => {
        document.body.innerHTML = '';
        expect(() => applyPartialTimeRangeFromMetadata(null)).not.toThrow();
    });

    it('shows detected range hint', () => {
        const meta: DatasetMetadata = {
            total_rows: 100,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 1700000000000, max: 1700001000000 },
            column_profiles: [],
        };
        applyPartialTimeRangeFromMetadata(meta);
        const hint = document.getElementById('time-range-hint')!;
        expect(hint.textContent).toContain('Detected:');
    });
});

// ── Database tab / sync behavior ──────────────────────────────────────────────

describe('initUploadPanel database tab', () => {
    beforeEach(() => {
        mocks.connectDatabase.mockReset();
        mocks.deleteDatabaseConnection.mockReset();
        mocks.fetchDatabaseStatus.mockReset();
        mocks.fetchDatabaseTables.mockReset();
        mocks.loadDatabaseTable.mockReset();
        mocks.toast.mockReset();
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
    });

    it('refreshes db tables on connect success', async () => {
        mocks.connectDatabase.mockResolvedValue({ message: 'connected' });
        mocks.fetchDatabaseTables.mockResolvedValue({ tables: [] });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const input = document.getElementById('db-connection-input') as HTMLInputElement;
        input.value = 'postgres://user:pass@localhost:5432/db';

        document.getElementById('db-connect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.fetchDatabaseTables).toHaveBeenCalled();
    });

    it('does not refresh db tables on init while the file tab is active', () => {
        datasetState.metadata = { total_rows: 0 } as any;

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        expect(mocks.fetchDatabaseTables).not.toHaveBeenCalled();
    });

    it('enables load button after connect success', async () => {
        mocks.connectDatabase.mockResolvedValue({ message: 'connected' });
        mocks.fetchDatabaseTables.mockResolvedValue({ tables: [] });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const input = document.getElementById('db-connection-input') as HTMLInputElement;
        input.value = 'postgres://user:pass@localhost:5432/db';

        document.getElementById('db-connect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        const loadBtn = document.getElementById('db-load-btn') as HTMLButtonElement;
        expect(loadBtn.disabled).toBe(false);
    });

    it('disables load button after disconnect', async () => {
        mocks.deleteDatabaseConnection.mockResolvedValue(undefined);

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        document.getElementById('db-disconnect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        const loadBtn = document.getElementById('db-load-btn') as HTMLButtonElement;
        expect(loadBtn.disabled).toBe(true);
    });

    it('shows error toast when database connect fails', async () => {
        mocks.connectDatabase.mockRejectedValue(new Error('bad credentials'));

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const input = document.getElementById('db-connection-input') as HTMLInputElement;
        input.value = 'postgres://user:pass@localhost:5432/db';

        document.getElementById('db-connect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('bad credentials'),
            'error',
            expect.anything(),
        );
    });

    it('shows error toast when database load fails', async () => {
        mocks.loadDatabaseTable.mockRejectedValue(new Error('table not found'));
        mocks.fetchDatabaseStatus.mockResolvedValue({ connected: false });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const tableInput = document.getElementById('db-table-input') as HTMLInputElement;
        tableInput.value = 'myschema.mytable';

        // `db-load-btn` is `disabled` in the test DOM by default; the
        // user-visible flow requires a successful connection first.
        // Enable it so the click handler actually fires (mirrors the
        // production behaviour after `handleDatabaseConnect` succeeds).
        const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
        if (dbLoadBtn) dbLoadBtn.disabled = false;

        dbLoadBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();
        await flushPromises();
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('table not found'),
            'error',
            expect.anything(),
        );
    });

    it('shows success toast after database load', async () => {
        mocks.loadDatabaseTable.mockResolvedValue({ rows: 5000 });
        mocks.fetchDatabaseStatus.mockResolvedValue({ connected: false });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const tableInput = document.getElementById('db-table-input') as HTMLInputElement;
        tableInput.value = 'myschema.mytable';

        // Same reasoning as above — enable before clicking so the handler
        // is reached. The production wiring does this after a successful
        // `connectDatabase` resolves.
        const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
        if (dbLoadBtn) dbLoadBtn.disabled = false;

        dbLoadBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();
        await flushPromises();
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('5,000'),
            'success',
            expect.anything(),
        );
    });

    it('shows info toast after database disconnect', async () => {
        mocks.deleteDatabaseConnection.mockResolvedValue(undefined);

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        document.getElementById('db-disconnect-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('disconnected'),
            'info',
            expect.anything(),
        );
    });
});

// ── File choose / drag-drop preview ───────────────────────────────────────────

describe('initUploadPanel file choose and preview', () => {
    beforeEach(() => {
        mocks.previewUpload.mockReset();
        mocks.toast.mockReset();
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
    });

    it('forwards a large file to server-side profiling via file input', async () => {
        const tooBigFile = makeOversizedFile('big.csv');

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [tooBigFile] });
        fileInput.dispatchEvent(new Event('change'));
        // `setUploadPreviewStatus` writes to `#upload-preview-status` (the
        // visible status pill above the profile grid). `#upload-status`
        // only holds the legacy global loading overlay text and is not
        const previewStatusEl = document.getElementById('upload-preview-status');
        expect(previewStatusEl?.textContent).toContain('Profiling file');
    });

    it('forwards a large file to server-side profiling via drop', async () => {
        const tooBigFile = makeOversizedFile('big.csv');

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const dropZone = document.getElementById('drop-zone')!;
        // happy-dom's `DragEvent` constructor ignores `dataTransfer` in
        // the init dict, so we create the event and stamp `dataTransfer`
        // onto the instance directly. The drop handler reads
        // `e.dataTransfer?.files[0]`, so this minimal shim is enough.
        const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent;
        Object.defineProperty(dropEvent, 'dataTransfer', {
            configurable: true,
            value: { files: [tooBigFile] },
        });
        dropZone.dispatchEvent(dropEvent);
        // Same target as the change-event test above — see that test for
        const previewStatusEl = document.getElementById('upload-preview-status');
        expect(previewStatusEl?.textContent).toContain('Profiling file');
    });

    it('calls previewUpload on valid file selection', async () => {
        const file = new File(['timestamp,value\n2024-01-01T00:00:00Z,1\n'], 'demo.csv', { type: 'text/csv' });
        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
        });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        expect(mocks.previewUpload).toHaveBeenCalled();
    });
});

// ── Upload submission success/error ───────────────────────────────────────────

describe('initUploadPanel upload submission', () => {
    beforeEach(() => {
        mocks.previewUpload.mockReset();
        mocks.uploadDataset.mockReset();
        mocks.fetchMetadata.mockReset();
        mocks.toast.mockReset();
        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
        });
        mocks.fetchMetadata.mockResolvedValue(makeMetadata());
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = 'timestamp';
    });

    it('shows error toast when no time column selected on upload', async () => {
        uiState.previewTimeColumn = null;
        datasetState.metadata = null;

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const file = new File(['a,b\n1,2\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();
        uiState.previewTimeColumn = null;
        datasetState.metadata = null;

        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('No time column'),
            'error',
            expect.anything(),
        );
    });

    it('shows error when upload fails', async () => {
        const file = new File(['a,b\n1,2\n'], 'demo.csv', { type: 'text/csv' });
        // Must mock previewUpload so upload submission can run (needs time column set)
        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
        });
        mocks.uploadDataset.mockResolvedValue({
            ok: false,
            text: async () => JSON.stringify({ error: 'Server error' }),
        } as Response);

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.toast).toHaveBeenCalledWith(
            expect.stringContaining('Upload failed'),
            'error',
            expect.anything(),
        );
    });

    it('refreshes the shared dataset lifecycle after successful upload', async () => {
        const file = new File(['timestamp,value\n2024-01-01T00:00:00Z,1\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        const refreshDatasetAfterMutation = vi.fn().mockResolvedValue(undefined);

        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
        });
        mocks.uploadDataset.mockResolvedValue({
            ok: true,
            json: async () => ({ rows: 2468 }),
        });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            refreshDatasetAfterMutation,
        });

        Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(refreshDatasetAfterMutation).toHaveBeenCalledTimes(1);
    });
});
