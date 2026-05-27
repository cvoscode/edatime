export function tableFromIPC(buffer: ArrayBuffer) {
    return {
        schema: { fields: [{ name: 'event_time', type: 'Int64' }, { name: 'value', type: 'Float64' }] },
        numRows: 3,
        getChild(name: string) {
            if (name === 'event_time') return { get: (i: number) => [1704067200000, 1704153600000, 1704240000000][i] };
            if (name === 'value') return { get: (i: number) => [1.0, 2.0, 3.0][i] };
            return null;
        },
    };
}
