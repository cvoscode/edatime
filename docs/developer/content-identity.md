# ADR: Dataset, Plan, and Result Identity

**Status:** Accepted for the in-memory version registry; scan-backed ingestion
must preserve this wire contract.

## Decision

Every dataset-derived result is attributable to an immutable source version
and, where applicable, the backend-validated cleaning plan. Identity is not
the mutable active-session revision and it is never supplied by the browser as
an authority.

The contract has three layers:

| Layer | Canonical fields | Purpose |
|---|---|---|
| Source | `sourceVersionId`, `sourceRevision`, `datasetFingerprint`, `schemaFingerprint` | Selects an immutable baseline. |
| Plan | backend `planHash` | Identifies executable cleaning semantics for that source. |
| Result | source + plan plus endpoint projection and sampling algorithm | Identifies a cache entry, response, export, or eventual job artifact. |

`none` is the explicit wire value for `x-edatime-plan-hash` when no executable
plan was applied. Missing headers are not equivalent to `none`; clients treat
them as unknown provenance for backwards compatibility only.

## Content fingerprints

`DatasetVersionRegistry` hashes canonical Arrow IPC bytes for a resident
frame. This captures logical schema, column order, row order, nulls, and
values, preventing equal-shaped but different uploads from sharing a baseline
fingerprint. `schemaFingerprint` remains a cheap shape diagnostic and must not
be used alone to validate a plan.

The current `fnv1a-content-*` fingerprint is deterministic but not
cryptographic. It is an application identity/cache guard, not a tamper-proof
signature. Scan-backed ingestion must calculate the same logical-content
identity while streaming and may introduce a versioned cryptographic hash only
through an explicitly documented migration.

## Result headers

Dataset-derived HTTP responses use these headers when the route has resolved a
source frame:

| Header | Meaning |
|---|---|
| `x-edatime-source-version` | Immutable source-version identifier. |
| `x-edatime-source-revision` | Immutable revision of that source version. |
| `x-edatime-schema-fingerprint` | Source schema diagnostic fingerprint. |
| `x-edatime-plan-hash` | Backend canonical executable-plan hash, or `none`. |
| `x-edatime-sampling-algorithm` | Present on sampled overview responses, e.g. `lttb-v1`. |

`x-edatime-dataset-revision` remains on `/data` as a compatibility alias for
the resolved source revision; new clients use the explicitly named source
header.

## Client rules

1. Capture the dataset request scope before a request and reject an invalidated
   scope before decoding or rendering the body.
2. Retain returned execution identity beside decoded Arrow data. Do not infer
   it from current workspace state after the response arrives.
3. Cache keys must include the resolved source version, source revision,
   backend plan hash, endpoint projection, and algorithm version where used.
4. A future job record/export manifest repeats this identity verbatim.

## Required compatibility tests

- Same shape with changed values produces a different dataset fingerprint.
- Selecting a retained source cannot hit a cache populated by another source.
- A planned response uses the source and backend hash from its validated
  envelope, even if the active dataset changes during the request.
- Timeseries, scatter, correlation, analytics, drift, and export routes expose
  the common headers; clients retain identity where they decode the response.
