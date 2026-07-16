// ── Barrel: re-export all route-family implementations ───────────────────────
//
// This file is the stable public contract for the API layer.
// Route-family modules own the implementation; this file only re-exports.
// Do not add implementation here — add it to the appropriate route-family file.

export { getJson, postJson } from './http.js';

// Metadata
export { fetchMetadata, fetchSampleDataset } from './metadata.js';
export {
    fetchDatasetProfile,
    fetchSampledDatasetProfile,
    startDatasetProfile,
    startSampledDatasetProfile,
} from './profile.js';

// Timeseries (Arrow IPC)
export { fetchData } from './timeseries.js';

// Scatter / Correlation
export { fetchScatterPoints, fetchScatterMatrix, fetchScatterCorrelations } from './scatter.js';
export { fetchCorrelationMatrix } from './scatter-matrix.js';

// Analytics
export {
    fetchRollingBands,
    fetchAnomalies,
    fetchFft,
    fetchSpectrogram,
    fetchCausalGraph,
    fetchSpectralFilter,
    // Interfaces re-exported so consumers don't need to import from sub-modules
    type RollingBand,
    type RollingResponse,
    type AnomalyRegion,
    type AnomalyResponse,
    type FftResult,
    type FftResponse,
    type SpectrogramResult,
    type SpectrogramResponse,
    type CausalLink,
    type CausalGraphResponse,
    type CorrelationMatrixResponse,
    type SpectralFilterResponse,
    // fetchCorrelationMatrix is exported from scatter-matrix.ts to avoid circular collision
} from './analytics.js';

// Export
export { exportParquet, exportScatterParquet } from './export.js';

// Upload / Database / Drift
export {
    previewUpload,
    uploadDataset,
    fetchDatabaseTables,
    connectDatabase,
    loadDatabaseTable,
    deleteDatabaseConnection,
    fetchDatabaseStatus,
    fetchDriftStats,
    fetchDriftInvestigation,
} from './upload.js';
