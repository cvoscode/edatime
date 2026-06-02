/**
 * Shared feature entrypoint contract.
 * All feature entrypoints (timeseries, scatter, drift, etc.) should
 * conform to this interface so pages can use a unified activation pattern.
 */

export interface FeatureEntrypoint {
    /**
     * Initialize the feature module. Called once when the feature first loads.
     * Implementations may perform synchronous setup and/or launch async
     * initialization internally; init() itself may return void or Promise<void>.
     */
    init(): void | Promise<void>;

    /** Dispose the feature and release resources. Optional. */
    dispose?: () => void;

    /**
     * Additional surface methods exposed by the entrypoint.
     * Feature-specific; not all entrypoints have the same extras.
     */
    [extra: string]: unknown;
}