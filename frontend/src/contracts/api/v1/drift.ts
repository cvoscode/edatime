/** Source-bound Drift preflight DTOs for the versioned API. */
export interface DriftPreflightColumn {
    column: string;
    referenceValidSamples: number;
    comparisonValidSamples: number;
    comparisonWindows: number;
    windowsBelowMinimum: number;
    averageWindowSamples: number;
    referenceToWindowRatio: number | null;
    decisionReady: boolean;
    warnings: string[];
    suggestions: string[];
}

export interface DriftPreflightResponse {
    sourceVersionId: string;
    sourceRevision: number;
    schemaFingerprint: string;
    planHash: string;
    window: 'hourly' | 'daily' | 'weekly';
    decisionReady: boolean;
    columns: DriftPreflightColumn[];
}

/** Per-window distribution statistics returned by `/api/v1/drift/stats`. */
export interface WindowDistributionStats {
    start_ms: number;
    end_ms: number;
    label: string;
    count: number;
    null_count: number;
    completeness: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    quantiles: number[];
    hist_bins: number[];
    hist_counts: number[];
    ecdf_x: number[];
    ecdf_y: number[];
}

export interface DriftWindowStats extends WindowDistributionStats {
    ks_stat: number;
    ks_pvalue: number;
    es_stat: number;
    es_pvalue: number;
    wasserstein: number;
    psi: number;
    jensen_shannon: number;
    drift_level: 'green' | 'yellow' | 'red';
    trigger_reasons: string[];
    completeness_delta: number;
    low_sample_warning: boolean;
}

export interface DriftResponse {
    column: string;
    reference: WindowDistributionStats;
    windows: DriftWindowStats[];
    thresholds: {
        ks_pvalue_threshold: number;
        es_pvalue_threshold: number;
        wasserstein_threshold: number;
        psi_minor_threshold: number;
        psi_major_threshold: number;
    };
    metadata?: {
        computation_time_ms: number;
        num_windows: number;
        reference_samples: number;
        bin_count_warning?: boolean;
        effective_bins?: number;
        psi_sample_ratio_warning?: boolean;
        avg_window_samples?: number;
    };
}
