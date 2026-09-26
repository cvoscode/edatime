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
    loadCurrentDatasetProfile: vi.fn(),
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

vi.mock('./currentProfile.js', () => ({
    loadCurrentDatasetProfile: mocks.loadCurrentDatasetProfile,
}));

import {
    initUploadPanel,
    setUploadPreviewStatus,
    setProfileMode,
    applyPartialTimeRangeFromMetadata,
    formatUploadRowCount,
    loadedRowCountFromResponse,
} from './panel';
import { uploadProfile as datasetState } from './profileState.js';
import { uploadUi } from './uploadUi.js';
import { setDropdownValue } from '../../ui/primitives/Dropdown.js';
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
        <button id="upload-preview-retry-btn" type="button" hidden>Retry preview</button>
        <button id="upload-profile-build-btn" type="button" hidden>Build exact profile</button>
        <span id="upload-preview-heading"></span>
        <span id="profile-mode-badge" data-mode="dataset">Active dataset</span>
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
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

    it('recovers active metadata and time range on direct Data source navigation, then exposes an explicit profile build', async () => {
        const activeMetadata = makeMetadata({
            revision: 8,
            source_version_id: 'direct-source',
            source_version_revision: 8,
            dataset_fingerprint: 'direct-fingerprint',
        });
        let currentMetadata: DatasetMetadata | null = null;
        const workspace = { getSnapshot: () => ({ dataset: { metadata: currentMetadata } }) };
        const ensureDatasetMetadata = vi.fn(async () => {
            currentMetadata = activeMetadata;
            return 'ready' as const;
        });
        const hydrate = vi.fn();
        const render = vi.fn();
        initUploadPanel(hydrate, render, {
            workspace: workspace as any,
            ensureDatasetMetadata,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });
        await flushPromises();

        expect(ensureDatasetMetadata).toHaveBeenCalledOnce();
        expect(datasetState.metadata).toBe(activeMetadata);
        expect(hydrate).toHaveBeenCalledWith(activeMetadata);
        expect(render).toHaveBeenCalledWith(true);
        expect(document.getElementById('upload-preview-status')?.textContent).toContain('Showing the active dataset profile');
        expect(document.getElementById('time-range-hint')?.textContent).toContain('Detected:');
        expect(mocks.loadCurrentDatasetProfile).toHaveBeenCalledWith(
            expect.any(AbortSignal), expect.any(Function), activeMetadata, expect.any(Object), { buildExact: false },
        );

        const buildButton = document.getElementById('upload-profile-build-btn') as HTMLButtonElement;
        buildButton.hidden = false;
        buildButton.click();
        expect(mocks.loadCurrentDatasetProfile.mock.calls.at(-1)?.[4]).toEqual({ buildExact: true });
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
    });

    it('select-all keeps the preview time column while reading profiles from store slices', () => {
        datasetState.columnProfiles = [
            { name: 'timestamp', dtype: 'datetime64[ms]' } as any,
            { name: 'value', dtype: 'float64' } as any,
            { name: 'other', dtype: 'float64' } as any,
        ];
        uploadUi.previewTimeColumn = 'timestamp';

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        document.getElementById('profile-select-all-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(datasetState.columnProfiles).toHaveLength(3);
        expect(uploadUi.previewSelectedColumns).toEqual(['timestamp', 'value', 'other']);
        expect(uploadUi.previewTimeColumn).toBe('timestamp');
    });
});

describe('setProfileMode', () => {
    beforeEach(() => {
        document.body.innerHTML = '<span id="upload-preview-heading"></span><span id="profile-mode-badge" data-mode="dataset">Active dataset</span>';
    });

    it('sets dataset mode', () => {
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Active dataset');
        expect(document.getElementById('upload-preview-heading')?.textContent).toBe('Current dataset profile');
    });

    it('distinguishes exact, sampled, and unavailable statistics', () => {
        const el = document.getElementById('profile-mode-badge')!;
        setProfileMode('exact');
        expect(el.getAttribute('data-mode')).toBe('exact');
        expect(el.textContent).toBe('Exact statistics');
        setProfileMode('sampled');
        expect(el.getAttribute('data-mode')).toBe('sampled');
        expect(el.textContent).toBe('Sampled estimate');
        setProfileMode('unavailable');
        expect(el.getAttribute('data-mode')).toBe('unavailable');
        expect(el.textContent).toBe('Statistics unavailable');
    });

    it('sets preview mode', () => {
        setProfileMode('preview');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('preview');
        expect(el.textContent).toBe('Not loaded yet');
        expect(document.getElementById('upload-preview-heading')?.textContent).toBe('Incoming file preview');
    });

    it('toggles between modes', () => {
        setProfileMode('preview');
        setProfileMode('dataset');
        const el = document.getElementById('profile-mode-badge')!;
        expect(el.getAttribute('data-mode')).toBe('dataset');
        expect(el.textContent).toBe('Active dataset');
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
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

    it('blocks ingestion while a replacement file preview is pending and submits only its schema', async () => {
        const firstFile = new File(['first'], 'first.csv', { type: 'text/csv' });
        const secondFile = new File(['second'], 'second.csv', { type: 'text/csv' });
        const secondMetadata = makeMetadata({
            columns: [
                { name: 'date', dtype: 'datetime64[ms]' } as any,
                { name: 'new_value', dtype: 'float64' } as any,
            ],
            numeric_columns: ['new_value'],
            time_column: 'date',
        });
        let resolveSecondBody!: (value: unknown) => void;
        const secondBody = new Promise((resolve) => { resolveSecondBody = resolve; });
        mocks.previewUpload
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ metadata: makeMetadata(), preview_rows: 1 }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => secondBody,
            } as unknown as Response);
        mocks.uploadDataset.mockResolvedValue({
            ok: true,
            json: async () => ({ rows: 5 }),
        });

        const refreshDatasetAfterMutation = vi.fn().mockResolvedValue(undefined);
        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            refreshDatasetAfterMutation,
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [firstFile] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();
        expect((document.getElementById('upload-btn') as HTMLButtonElement).disabled).toBe(false);

        Object.defineProperty(fileInput, 'files', { configurable: true, value: [secondFile] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();

        expect((document.getElementById('upload-btn') as HTMLButtonElement).disabled).toBe(true);
        expect(datasetState.metadata).toBeNull();
        expect(uploadUi.previewSelectedColumns).toEqual([]);
        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(mocks.uploadDataset).not.toHaveBeenCalled();

        resolveSecondBody({ metadata: secondMetadata, preview_rows: 1 });
        await flushPromises();
        expect((document.getElementById('upload-btn') as HTMLButtonElement).disabled).toBe(false);

        document.getElementById('upload-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        const submitted = mocks.uploadDataset.mock.calls[0][0] as FormData;
        expect((submitted.get('file') as File).name).toBe('second.csv');
        expect(JSON.parse(String(submitted.get('columns')))).toEqual(['date', 'new_value']);
        expect(submitted.get('time_column')).toBe('date');
    });

    function mockPreviewEchoingTimeColumn(): void {
        mocks.previewUpload.mockImplementation(async (formData: FormData) => {
            const requestedTimeColumn = String(formData.get('time_column') || 'timestamp');
            return {
                ok: true,
                json: async () => ({
                    metadata: makeMetadata({
                        columns: [
                            { name: 'timestamp', dtype: 'datetime64[ms]' } as any,
                            { name: 'other_time', dtype: 'datetime64[ms]' } as any,
                            { name: 'value', dtype: 'float64' } as any,
                        ],
                        time_column: requestedTimeColumn,
                    }),
                    preview_rows: 2,
                }),
            } as Response;
        });
    }

    function dropFile(file: File): void {
        const event = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent;
        Object.defineProperty(event, 'dataTransfer', { configurable: true, value: { files: [file] } });
        document.getElementById('drop-zone')!.dispatchEvent(event);
    }

    function capturedPreview(form: FormData): { file: File; timeColumn: string } {
        return {
            file: form.get('file') as File,
            timeColumn: String(form.get('time_column') || ''),
        };
    }

    it('re-previews the dropped file when its time column changes without any browse selection', async () => {
        mockPreviewEchoingTimeColumn();
        const dropped = new File(['time,value'], 'dropped.csv', { type: 'text/csv' });
        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        dropFile(dropped);
        await flushPromises();
        setDropdownValue('time-column-select', 'other_time', { emitChange: true });
        await flushPromises();

        expect(mocks.previewUpload).toHaveBeenCalledTimes(2);
        const captured = mocks.previewUpload.mock.calls.map(([form]) => capturedPreview(form as FormData));
        expect(captured.map(({ file }) => file.name)).toEqual(['dropped.csv', 'dropped.csv']);
        expect(captured[1]).toMatchObject({ timeColumn: 'other_time' });
    });

    it('keeps browse-then-drop ownership on the dropped file for a later time-column change', async () => {
        mockPreviewEchoingTimeColumn();
        const browsed = new File(['old'], 'browsed.csv', { type: 'text/csv' });
        const dropped = new File(['new'], 'dropped.csv', { type: 'text/csv' });
        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [browsed] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();
        dropFile(dropped);
        await flushPromises();
        setDropdownValue('time-column-select', 'other_time', { emitChange: true });
        await flushPromises();

        const captured = mocks.previewUpload.mock.calls.map(([form]) => capturedPreview(form as FormData));
        expect(captured.map(({ file }) => file.name)).toEqual(['browsed.csv', 'dropped.csv', 'dropped.csv']);
        expect(captured[2]).toMatchObject({ timeColumn: 'other_time' });
    });

    it('keeps a failed file selected and offers a preview retry', async () => {
        const file = new File(['retry'], 'retry.csv', { type: 'text/csv' });
        mocks.previewUpload
            .mockRejectedValueOnce(new Error('Parse failed'))
            .mockResolvedValueOnce({
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

        const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
        const retryBtn = document.getElementById('upload-preview-retry-btn') as HTMLButtonElement;
        expect(uploadBtn.disabled).toBe(true);
        expect(retryBtn.hidden).toBe(false);
        expect(fileInput.files?.[0]).toBe(file);

        retryBtn.click();
        await flushPromises();

        expect(mocks.previewUpload).toHaveBeenCalledTimes(2);
        expect(mocks.previewUpload.mock.calls[1][0].get('file')).toBe(file);
        expect(retryBtn.hidden).toBe(true);
        expect(uploadBtn.disabled).toBe(false);
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
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = 'timestamp';
    });

    it('shows an error and keeps ingestion disabled when preview has no time column', async () => {
        uploadUi.previewTimeColumn = null;
        datasetState.metadata = null;
        mocks.previewUpload.mockResolvedValue({
            ok: true,
            json: async () => ({
                metadata: makeMetadata({
                    columns: [{ name: 'value', dtype: 'float64' } as any],
                    numeric_columns: ['value'],
                    time_column: null,
                    time_range: null,
                }),
                preview_rows: 1,
            }),
        });

        initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        });

        const file = new File(['a,b\n1,2\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
        fileInput.dispatchEvent(new Event('change'));
        await flushPromises();
        uploadUi.previewTimeColumn = null;
        datasetState.metadata = null;

        const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
        expect(uploadBtn.disabled).toBe(true);
        uploadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(mocks.uploadDataset).not.toHaveBeenCalled();
        expect(document.getElementById('upload-preview-status')?.textContent).toContain('No time column');
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

    it('clears the selected file after success and prevents a second outgoing upload', async () => {
        const file = new File(['timestamp,value\n2024-01-01T00:00:00Z,1\n'], 'demo.csv', { type: 'text/csv' });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        const fileDisplay = document.getElementById('file-name-display')!;
        const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
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

        const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent;
        Object.defineProperty(dropEvent, 'dataTransfer', { configurable: true, value: { files: [file] } });
        document.getElementById('drop-zone')!.dispatchEvent(dropEvent);
        await flushPromises();
        expect(fileDisplay.textContent).toBe('demo.csv');
        expect(fileInput.files).toHaveLength(0);

        uploadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();
        await flushPromises();

        expect(refreshDatasetAfterMutation).toHaveBeenCalledOnce();
        expect(mocks.uploadDataset).toHaveBeenCalledOnce();
        expect(fileDisplay.textContent).toBe('');
        expect(fileInput.files).toHaveLength(0);
        expect(uploadBtn.disabled).toBe(true);

        uploadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();
        expect(mocks.uploadDataset).toHaveBeenCalledOnce();
    });
});


describe('upload asynchronous ownership regressions', () => {
    function choose(file: File | null): void {
        const input = document.getElementById('file-upload') as HTMLInputElement;
        Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
        input.dispatchEvent(new Event('change'));
    }

    beforeEach(() => {
        buildUploadDom();
        datasetState.metadata = null;
        datasetState.columnProfiles = [];
        uploadUi.previewSelectedColumns = [];
        uploadUi.previewTimeColumn = null;
    });

    it('ignores a delayed preview body after the file selection is cleared', async () => {
        let finish!: (body: unknown) => void;
        const json = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
        mocks.previewUpload.mockResolvedValue({ json });
        const dispose = initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(), buildRangeControls: vi.fn(),
        });
        await flushPromises();
        choose(new File(['ts,value'], 'old.csv'));
        await vi.waitFor(() => expect(json).toHaveBeenCalled());
        choose(null);
        finish({ metadata: makeMetadata() });
        await flushPromises();
        expect(datasetState.metadata).toBeNull();
        expect(uploadUi.previewSelectedColumns).toEqual([]);
        expect(document.getElementById('upload-preview-status')?.textContent).not.toContain('Preview ready');
        expect((document.getElementById('upload-btn') as HTMLButtonElement).disabled).toBe(true);
        dispose();
    });

    it('keeps the latest time-column preview ready after an older body finishes', async () => {
        const metadata = makeMetadata({ columns: [
            { name: 'timestamp', dtype: 'Datetime[ms]' },
            { name: 'other_time', dtype: 'Datetime[ms]' },
            { name: 'value', dtype: 'Float64' },
        ] });
        mocks.previewUpload.mockResolvedValue({ json: async () => ({ metadata }) });
        const dispose = initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(), buildRangeControls: vi.fn(),
        });
        choose(new File(['ts,value'], 'same.csv'));
        await flushPromises();
        let finish!: (body: unknown) => void;
        const json = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
        mocks.previewUpload.mockResolvedValueOnce({ json });
        setDropdownValue('time-column-select', 'other_time', { emitChange: true });
        await vi.waitFor(() => expect(json).toHaveBeenCalled());
        setDropdownValue('time-column-select', 'timestamp', { emitChange: true });
        await flushPromises();
        finish({ metadata: { ...metadata, time_column: 'other_time' } });
        await flushPromises();
        expect(uploadUi.previewTimeColumn).toBe('timestamp');
        expect((document.getElementById('upload-btn') as HTMLButtonElement).disabled).toBe(false);
        dispose();
    });

    it('coalesces submissions and preserves a replacement preview while the earlier upload completes', async () => {
        mocks.previewUpload.mockResolvedValue({ json: async () => ({ metadata: makeMetadata() }) });
        let finish!: (response: unknown) => void;
        mocks.uploadDataset.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        const dispose = initUploadPanel(vi.fn(), vi.fn(), {
            buildColumnToggles: vi.fn(), buildRangeControls: vi.fn(),
        });
        choose(new File(['ts,value'], 'first.csv'));
        await flushPromises();
        const button = document.getElementById('upload-btn') as HTMLButtonElement;
        button.click();
        const replacement = makeMetadata({ source_name: 'replacement preview' });
        mocks.previewUpload.mockResolvedValue({ json: async () => ({ metadata: replacement }) });
        choose(new File(['ts,value'], 'replacement.csv'));
        await flushPromises();
        expect(button.disabled).toBe(true);
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(mocks.uploadDataset).toHaveBeenCalledTimes(1);
        finish({ json: async () => ({ rows: 2 }) });
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(datasetState.metadata).toBe(replacement);
        expect(document.getElementById('file-name-display')?.textContent).toBe('replacement.csv');
        expect(document.getElementById('profile-mode-badge')?.dataset.mode).toBe('preview');
        dispose();
    });
});
