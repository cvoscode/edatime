import type { WorkspaceStore } from '../../contracts/workspace.js';
import type { DatasetMetadata } from '../../types/api.js';
import type { ApiRequestOptions } from '../../services/api/http.js';

export type HomeMetadataResult = 'ready' | 'empty';

export interface HomeMetadataBootstrapDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'beginDatasetSession' | 'commitDataset'>;
    fetchMetadata(options?: ApiRequestOptions): Promise<DatasetMetadata>;
}

function isNoActiveDataset(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const apiError = error as { status?: unknown; code?: unknown };
    return Number(apiError.status) === 404 && apiError.code === 'not_found';
}

function createAbortError(): Error {
    const error = new Error('Overview metadata request was superseded by a dataset change.');
    error.name = 'AbortError';
    return error;
}

/** Fetch source metadata for Overview without initializing charts or profiles. */
export function createHomeMetadataBootstrap(deps: HomeMetadataBootstrapDeps): {
    ensure(): Promise<HomeMetadataResult>;
} {
    let pending: Promise<HomeMetadataResult> | null = null;

    function ensure(): Promise<HomeMetadataResult> {
        if (deps.workspace.getSnapshot().dataset.metadata) return Promise.resolve('ready');
        if (pending) return pending;

        const session = deps.workspace.beginDatasetSession();
        const request = (async (): Promise<HomeMetadataResult> => {
            let metadata: DatasetMetadata;
            try {
                metadata = await deps.fetchMetadata({ signal: session.signal });
            } catch (error) {
                if (session.signal.aborted) throw createAbortError();
                if (isNoActiveDataset(error)) return 'empty';
                throw error;
            }
            if (session.signal.aborted) throw createAbortError();
            const revision = Number.isFinite(Number(metadata.revision)) ? Number(metadata.revision) : 0;
            if (!deps.workspace.commitDataset(session, metadata, revision)) {
                if (deps.workspace.getSnapshot().dataset.metadata) return 'ready';
                throw createAbortError();
            }
            return 'ready';
        })();
        pending = request;
        void request.finally(() => {
            if (pending === request) pending = null;
        }).catch(() => {});
        return request;
    }

    return { ensure };
}
