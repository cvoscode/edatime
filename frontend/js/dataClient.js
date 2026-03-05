let tableFromIPCFn = null;

const DEBUG = (() => {
    try {
        const qs = new URLSearchParams(window.location.search);
        if (qs.get('debug') === '1') return true;
        if (qs.get('debug') === 'true') return true;
        return window.localStorage?.getItem('edatimeDebug') === '1';
    } catch (_) {
        return false;
    }
})();

function dbg(...args) {
    if (!DEBUG) return;
    console.log('[edatime:data]', ...args);
}

async function ensureArrowParser() {
    if (tableFromIPCFn) return tableFromIPCFn;
    try {
        const arrow = await import('https://esm.sh/apache-arrow@16.0.0?bundle');
        if (!arrow?.tableFromIPC) {
            throw new Error('Apache Arrow module loaded but tableFromIPC is missing.');
        }
        tableFromIPCFn = arrow.tableFromIPC;
        return tableFromIPCFn;
    } catch (e) {
        throw new Error(`Failed to load Apache Arrow parser: ${e.message}`);
    }
}

export async function fetchMetadata() {
    const res = await fetch('/api/metadata');
    if (!res.ok) throw new Error("Metadata check failed");
    return await res.json();
}

export async function fetchData(start, end, width, columns = "value") {
    const params = new URLSearchParams({
        start,
        end,
        width: String(width),
        columns,
    });

    const tableFromIPC = await ensureArrowParser();
    const url = `/api/data?${params.toString()}`;

    dbg('GET', url);
    const res = await fetch(url);

    if (DEBUG) {
        dbg('status', res.status, res.statusText);
        dbg('content-type', res.headers.get('content-type'));
        dbg('content-length', res.headers.get('content-length'));
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Data fetch failed (${res.status}) ${text}`);
    }

    const buffer = await res.arrayBuffer();

    if (DEBUG) {
        dbg('arrow bytes', buffer.byteLength);
    }

    const table = tableFromIPC(buffer);

    if (DEBUG) {
        try {
            const fields = table.schema?.fields?.map(f => `${f?.name}:${String(f?.type)}`) ?? [];
            dbg('arrow schema', fields);
            dbg('rows', table.numRows);
        } catch (_) {
            // ignore
        }
    }

    const tsCol = table.getChild("ts");
    if (!tsCol) throw new Error("No timestamp column found");

    const len = table.numRows;
    let tsArray = new Float64Array(len);

    function toEpochMs(value) {
        if (value instanceof Date) return value.getTime();

        const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
        const abs = Math.abs(numericValue);

        if (abs >= 1e17) return numericValue / 1e6;
        if (abs >= 1e14) return numericValue / 1e3;
        if (abs >= 1e12) return numericValue;
        return numericValue * 1e3;
    }

    for (let i = 0; i < len; i++) {
        tsArray[i] = toEpochMs(tsCol.get(i));
    }

    if (DEBUG && len > 0) {
        const first = tsArray[0];
        const last = tsArray[len - 1];
        dbg('ts epoch-ms first/last', first, last);
    }

    const dataObj = {
        ts: tsArray,
        values: {}
    };

    const requestedCols = columns.split(',');
    requestedCols.forEach(colName => {
        const valCol = table.getChild(colName);
        if (valCol) {
            let valArray = new Float64Array(len);
            for (let i = 0; i < len; i++) {
                valArray[i] = Number(valCol.get(i));
            }
            dataObj.values[colName] = valArray;
        }
    });

    return dataObj;
}
