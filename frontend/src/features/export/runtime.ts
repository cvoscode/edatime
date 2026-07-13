import { createExportFeature, type ExportFeature, type ExportFeatureDeps } from './entrypoint.js';

let exportFeature: ExportFeature | null = null;

export function configureExportFeature(deps: ExportFeatureDeps): void {
    exportFeature = createExportFeature(deps);
}

export function exportFilteredData(format: 'csv' | 'json' = 'csv'): boolean {
    if (!exportFeature) return false;
    return format === 'json' ? exportFeature.exportFilteredJson() : exportFeature.exportFilteredCsv();
}

export async function exportFilteredParquet(): Promise<boolean> {
    return exportFeature?.exportFilteredParquet() ?? false;
}
