# ai/frontend/src/app.md
> Frontend bootstrap entrypoint. Resets the loading overlay, hydrates persisted chart prefs, lazy-loads transport/chart modules, and then boots the app shell plus timeseries runtime.

## Type Aliases
- `DataChartCtorType = new (containerId: string, onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCallback: (() => void) | null) => ChartInstance`

## Functions
- `init(): Promise<void>`
  - Upgrades shared form controls, hydrates chart-state preferences via `initChartStatePrefs()`, initializes the shell/runtime, and then marks the app ready in `finally`.

## State
- `_appCleanups: Array<() => void>`
- `__edatime.state = appStateComposite`
