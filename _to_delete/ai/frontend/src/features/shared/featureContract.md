# ai/frontend/src/features/shared/featureContract.md
> Shared feature entrypoint contract. All feature entrypoints (timeseries, scatter, drift, etc.) conform to this interface so pages can use a unified activation pattern.

## Interface: FeatureEntrypoint
```ts
interface FeatureEntrypoint {
    init(): void | Promise<void>;
    dispose?: () => void;
    [extra: string]: unknown;
}
```
- `init(): void | Promise<void>` — initialize the feature; may be synchronous or return a Promise for async initialization.
- `dispose?: () => void` — optional dispose/release hook.