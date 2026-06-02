# ai/frontend/src/features/shared/featureContract.md
> Shared feature entrypoint contract. All feature entrypoints (timeseries, scatter, drift, etc.) conform to this interface so pages can use a unified activation pattern.

## Interface: FeatureEntrypoint
```ts
interface FeatureEntrypoint {
    init(): void;
    dispose?: () => void;
    [extra: string]: unknown;
}
```
- `init(): void` — synchronous setup; any async work is handled internally so `init()` always returns void.
- `dispose?: () => void` — optional dispose/release hook.