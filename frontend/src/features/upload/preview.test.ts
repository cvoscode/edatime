import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploadPreviewController, applyPreviewColumnSelection } from './preview.js';
import { uploadProfile } from './profileState.js';
import { uploadUi } from './uploadUi.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { previewUpload } from '../../services/api/index.js';

vi.mock('../../services/api/index.js', () => ({ previewUpload: vi.fn() }));
vi.mock('../../utils/toast.js', () => ({ toast: vi.fn() }));

const metadata = (name: string) => ({
    columns: [{ name, dtype: 'Float64' }], numeric_columns: [name],
    time_column: 'ts', time_range: { min: 1, max: 2 }, total_rows: 2, column_profiles: [],
});
const file = new File(['ts,value\n1,2'], 'data.csv');
const callbacks = () => ({
    hydrateColumnProfiles: vi.fn(), renderColumnProfilesGrid: vi.fn(), onTimeColumnChanged: vi.fn(),
});

describe('upload preview ownership', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        document.body.innerHTML = '<span id="upload-preview-status"></span><select id="time-column-select"></select>';
        uploadProfile.metadata = null;
        uploadUi.previewTimeColumn = null;
        uploadUi.previewSelectedColumns = [];
    });

    it('keeps preview metadata separate from the committed workspace on success and failure', async () => {
        const workspace = createWorkspaceStore();
        workspace.commitDataset(workspace.beginDatasetSession(), metadata('active'), 7);
        const before = workspace.getSnapshot();
        const controller = createUploadPreviewController();
        vi.mocked(previewUpload).mockResolvedValueOnce(new Response(JSON.stringify({ metadata: metadata('preview') })));
        await controller.run(file, callbacks());
        expect(uploadProfile.metadata?.numeric_columns).toEqual(['preview']);
        expect(workspace.getSnapshot()).toEqual(before);
        vi.mocked(previewUpload).mockRejectedValueOnce(new Error('Parse failed'));
        await controller.run(file, callbacks());
        expect(workspace.getSnapshot()).toEqual(before);
        controller.dispose();
    });

    it('ignores an older response whose JSON finishes after a newer preview', async () => {
        let resolveBody!: (value: unknown) => void;
        const body = new Promise(resolve => { resolveBody = resolve; });
        const readBody = vi.fn(() => body);
        vi.mocked(previewUpload)
            .mockResolvedValueOnce({ json: readBody } as unknown as Response)
            .mockResolvedValueOnce(new Response(JSON.stringify({ metadata: metadata('new') })));
        const controller = createUploadPreviewController();
        const oldCallbacks = callbacks();
        const old = controller.run(file, oldCallbacks);
        await vi.waitFor(() => expect(readBody).toHaveBeenCalled());
        await controller.run(file, callbacks());
        resolveBody({ metadata: metadata('old') });
        await old;
        expect(oldCallbacks.hydrateColumnProfiles).not.toHaveBeenCalled();
        expect(uploadProfile.metadata?.numeric_columns).toEqual(['new']);
        controller.dispose();
    });

    it('aborts requests with the panel lifetime and rejects late bodies after disposal', async () => {
        let resolveBody!: (value: unknown) => void;
        const body = new Promise(resolve => { resolveBody = resolve; });
        vi.mocked(previewUpload).mockResolvedValue({ json: () => body } as unknown as Response);
        const controller = createUploadPreviewController();
        const lifetime = new AbortController();
        const cb = { ...callbacks(), signal: lifetime.signal };
        const pending = controller.run(file, cb);
        await Promise.resolve();
        lifetime.abort();
        expect(vi.mocked(previewUpload).mock.calls[0][1]?.signal?.aborted).toBe(true);
        controller.dispose();
        resolveBody({ metadata: metadata('late') });
        await pending;
        expect(cb.hydrateColumnProfiles).not.toHaveBeenCalled();
        await controller.run(file, cb);
        expect(previewUpload).toHaveBeenCalledTimes(1);
    });

    it('replaces the time-column binding on each preview and removes it on teardown', () => {
        const lifetime = new AbortController();
        const cb = { ...callbacks(), signal: lifetime.signal };
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'file-upload';
        Object.defineProperty(input, 'files', { value: [file] });
        document.body.append(input);
        applyPreviewColumnSelection(metadata('a'), cb);
        applyPreviewColumnSelection(metadata('b'), cb);
        document.getElementById('time-column-select')!.dispatchEvent(new Event('change'));
        expect(cb.onTimeColumnChanged).toHaveBeenCalledTimes(1);
        lifetime.abort();
        document.getElementById('time-column-select')!.dispatchEvent(new Event('change'));
        expect(cb.onTimeColumnChanged).toHaveBeenCalledTimes(1);
    });
});
