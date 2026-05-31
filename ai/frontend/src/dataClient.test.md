# dataClient.test.md
> Tests for `dataClient.ts` — validates HTTP/Arrow transport layer: fetch helpers, metadata validation, scatter response guards, URL construction, timestamp resolution, and Arrow color-column population.

## Test Suite: dataClient fetch helpers

### Arrow Parsing & Color Column
- `populates data.color_column and data.color when a color column is present in the Arrow table`

### Downsample Header Handling
- `sets downsampleKnown to false when x-edatime-downsampled header is absent`
- `reads x-edatime-returned-rows and x-edatime-target-points into _meta`

### Timestamp Resolution
- `interprets timestamps below 1e11 as seconds (epoch seconds → ms)`
- `interprets timestamps between 1e11 and 1e14 as milliseconds (passthrough)`
- `interprets timestamps between 1e14 and 1e17 as microseconds (÷ 1000)`
- `interprets timestamps ≥ 1e17 as nanoseconds (÷ 1e6)`

---
[1]: ./dataClient.md