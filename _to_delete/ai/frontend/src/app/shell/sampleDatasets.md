# ai/frontend/src/app/shell/sampleDatasets.md
> Wires click handlers on `[data-sample-dataset]` elements to load a built-in sample dataset into the upload panel.

## Functions
- `wireSampleDatasetCards(showPage: (page: string) => void): void`
  - Attaches click listeners to sample dataset cards; calls `loadSampleDataset(datasetId, showPage)` on click.
- `loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>` [deps: [fetchSampleDataset][1], [toast][2]]
  - Loads `ettm2` (fetches ETTm2.csv from server), `sinusoidal` (generates CSV in-memory), or `weather` (generates CSV in-memory); shows upload page and populates the file input.
- `generateSinusoidalCsv(): string`
  - Generates a 7-day, 15-min interval CSV with `timestamp,temperature,humidity,pressure` + sine-based values.
- `generateWeatherCsv(): string`
  - Generates an 8-day, 10-min interval CSV with `timestamp,temperature,humidity,pressure,wind_speed` + diurnal patterns.

---
[1]: ../../services/api/index.md#fetchSampleDataset
[2]: ../../utils/toast.md