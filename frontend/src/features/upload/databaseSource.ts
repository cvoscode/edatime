/**
 * Database source logic — connect, load table, disconnect, status sync.
 */
import {
    connectDatabase,
    deleteDatabaseConnection,
    fetchDatabaseTables,
    fetchDatabaseStatus,
    loadDatabaseTable,
} from '../../services/api/index.js';
import { formatCount } from '../../utils/format.js';
import { toast } from '../../utils/toast.js';
import { loadedRowCountFromResponse } from './preview.js';

// ── Table select population ─────────────────────────────────────────────────--

export async function refreshDbTables(): Promise<void> {
    const dbTableSelect = document.getElementById('db-table-select') as HTMLSelectElement | null;
    if (!dbTableSelect) return;
    try {
        const data = await fetchDatabaseTables() as { tables?: Array<{ schema: string; name: string; kind: string }> };
        const tables: Array<{ schema: string; name: string; kind: string }> = data.tables ?? [];
        // Use textContent for options to avoid innerHTML XSS; clear with empty string first
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— select table —';
        dbTableSelect.replaceChildren(placeholder);
        for (const t of tables) {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.kind === 'hypertable' ? `⏱ ${t.schema}.${t.name}` : `${t.schema}.${t.name}`;
            dbTableSelect.appendChild(opt);
        }
    } catch {
        // ignore; user can still type the name manually
    }
}

// ── Status sync ─────────────────────────────────────────────────────────────--

let _dbStatusLoaded = false;

export async function syncDatabaseStatus(): Promise<void> {
    if (_dbStatusLoaded) return;
    _dbStatusLoaded = true;
    try {
        const s = await fetchDatabaseStatus() as { connected?: boolean; table?: string };
        if (s.connected) {
            const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
            const dbDisconnectBtn = document.getElementById('db-disconnect-btn') as HTMLButtonElement | null;
            const dbStatus = document.getElementById('db-status');
            if (dbLoadBtn) dbLoadBtn.disabled = false;
            if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
            if (dbStatus) { dbStatus.textContent = `Connected to ${s.table || '(no table loaded)'}`; dbStatus.className = 'upload-status success'; }
            void refreshDbTables();
        }
    } catch {
        _dbStatusLoaded = false;
    }
}

export function resetDatabaseStatusLoaded(): void {
    _dbStatusLoaded = false;
}

// ── Connect button handler ───────────────────────────────────────────────────

export interface DbConnectParams {
    connectionString: string;
    schema: string;
    dbConnectBtn: HTMLButtonElement;
    dbStatus: HTMLElement;
    dbLoadBtn: HTMLButtonElement | null;
    dbDisconnectBtn: HTMLButtonElement | null;
}

export async function handleDatabaseConnect(params: DbConnectParams): Promise<void> {
    const { connectionString, schema, dbConnectBtn, dbStatus, dbLoadBtn, dbDisconnectBtn } = params;

    if (!connectionString.trim()) {
        if (dbStatus) { dbStatus.textContent = 'Connection string is required.'; dbStatus.className = 'upload-status error'; }
        toast('Connection string is required.', 'error', {});
        return;
    }

    dbConnectBtn.disabled = true;
    if (dbStatus) { dbStatus.textContent = 'Connecting…'; dbStatus.className = 'upload-status loading'; }

    try {
        const result = await connectDatabase({
            connection_string: connectionString.trim(),
            schema,
            load_snapshot: false,
        }) as { message?: string; error?: string };
        if (result) {
            if (dbStatus) { dbStatus.textContent = 'Connected. Choose a table and click Load data.'; dbStatus.className = 'upload-status success'; }
            toast('Database connected. Choose a table and click Load data.', 'success', {});
            if (dbLoadBtn) dbLoadBtn.disabled = false;
            if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
            await refreshDbTables();
        }
    } catch (e: unknown) {
        if (dbStatus) { dbStatus.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e)); dbStatus.className = 'upload-status error'; }
        toast(`Database connection failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
    } finally {
        dbConnectBtn.disabled = false;
    }
}

// ── Load button handler ──────────────────────────────────────────────────────

export interface DbLoadParams {
    schema: string;
    table: string;
    timeColumn: string | null;
    dbLoadBtn: HTMLButtonElement;
    dbStatus: HTMLElement;
}

export async function handleDatabaseLoad(params: DbLoadParams): Promise<void> {
    const { schema, table, timeColumn, dbLoadBtn, dbStatus } = params;

    if (!table) {
        if (dbStatus) { dbStatus.textContent = 'Select or enter a table name.'; dbStatus.className = 'upload-status error'; }
        toast('Select or enter a table name.', 'error', {});
        return;
    }

    dbLoadBtn.disabled = true;
    if (dbStatus) { dbStatus.textContent = 'Loading data…'; dbStatus.className = 'upload-status loading'; }

    try {
        const result = await loadDatabaseTable({
            schema,
            table,
            time_column: timeColumn || null,
            limit: 1_000_000,
        }) as { message?: string; error?: string };
        if (result) {
            const loadedRows = loadedRowCountFromResponse(result);
            if (dbStatus) {
                dbStatus.textContent = `Loaded ${loadedRows.toLocaleString()} rows from ${table}.`;
                dbStatus.className = 'upload-status success';
            }
            toast(`${formatCount(loadedRows)} rows loaded from ${table}.`, 'success', {});
            // Trigger a full metadata reload so the chart page refreshes.
            window.dispatchEvent(new CustomEvent('edatime:dataset-changed', { detail: { source: 'database', table } }));
        }
    } catch (e: unknown) {
        if (dbStatus) { dbStatus.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e)); dbStatus.className = 'upload-status error'; }
        toast(`Database load failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
    } finally {
        dbLoadBtn.disabled = false;
    }
}

// ── Disconnect button handler ───────────────────────────────────────────────

export interface DbDisconnectParams {
    dbDisconnectBtn: HTMLButtonElement;
    dbLoadBtn: HTMLButtonElement | null;
    dbStatus: HTMLElement;
    dbTableSelect: HTMLSelectElement | null;
}

export async function handleDatabaseDisconnect(params: DbDisconnectParams): Promise<void> {
    const { dbDisconnectBtn, dbLoadBtn, dbStatus, dbTableSelect } = params;

    try {
        await deleteDatabaseConnection();
    } catch { /* ignore */ }
    if (dbStatus) { dbStatus.textContent = 'Disconnected.'; dbStatus.className = 'upload-status'; }
    toast('Database disconnected.', 'info', {});
    if (dbLoadBtn) dbLoadBtn.disabled = true;
    if (dbDisconnectBtn) dbDisconnectBtn.hidden = true;
    if (dbTableSelect) {
        dbTableSelect.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— connect first —';
        dbTableSelect.appendChild(placeholder);
    }
}