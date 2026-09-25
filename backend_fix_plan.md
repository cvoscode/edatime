# Backend fix plan

This plan tracks implementation of `backend_issues.md`. The issue list is the evidence source; this file records the repair order and completion checks. Existing API contracts, canonical cleaning semantics, bounded execution, and measured behavior take precedence over speculative optimization.

## Work order and acceptance checks

| Issue | Planned change | Acceptance check | Status |
| --- | --- | --- | --- |
| B01 | Validate the complete cleaning plan once; apply preview stages with validated prefix context. | Sort→fill and sort→resample previews report correct per-stage impacts; invalid, disabled, and reordered prerequisites still fail. | Done |
| B02 | Sort chart presentation data ascending by selected time after canonical transformations. | Descending and non-time sorts return chronological Signals data below and above the envelope threshold; saved row order remains unchanged. | Done |
| B03 | Convert epoch-ms bounds to native timestamp ticks and compute envelope widths in epoch milliseconds. | Date, datetime-ms, datetime-us, and datetime-ns fixtures cover the same interval and comparable buckets. | Done |
| B04 | Store the selected time-column name on immutable versions and use it in metadata/profiling/restoration. | Two-time-column profiles and version switching preserve the correct column and range. | Done |
| B08 | Use the same exact profiler for preview with automatic or explicit time-column selection. | Explicitly selecting the auto-detected column preserves distributions and quality statistics. | Done |
| B09 | Reject absent explicit time-column overrides with field-specific 400 errors. | Missing override stays optional; valid explicit override works; invalid/wrong-type values reject. | Done |
| B13 | Preserve native integer identity for distinctness, constant status, and extrema; expose exact integer strings. | Adjacent i64/u64 values above 2^53 remain distinct and nonconstant, including boundary cases. | Done |
| B06 | Derive sampling headers from the whole envelope-plus-LTTB pipeline. | Envelope, final LTTB, and exact windows report consistent approximation/downsampled metadata. | Done |
| B07 | Compute diagonal correlations with off-diagonal validity and variance rules. | Constant, null, nonfinite, singleton, and constant-difference diagonals are undefined with truthful counts. | Done |
| B14 | Difference adjacent aligned rows in ascending selected-time order without bridging invalid gaps. | Missing masks and saved non-time sort preserve documented sample counts and coefficients. | Done |
| B05 | Project only analysis columns, bound correlation work and cache bytes, and support base-only pair work. | Wide/unbounded fixtures reject or stay within configured limits; cache invalidation/single-flight pass; benchmark representative tall source. | Done |
| B10 | Strictly parse multipart constraints and accept one named `file` plus known optional fields. | Missing optional values stay optional; malformed, duplicate, unknown, and multiple-file fields reject without ingest. | Done |
| B11 | Move data expansion/reduction/serialization/fingerprinting to bounded workers and multipart writes to Tokio I/O. | Route tests pass; canceled workers retain permits; concurrent interactive jobs keep Tokio timers responsive. | Done |
| B12 | Restore retained versions as lazy snapshots with metadata instead of collecting them into the repository. | Artifact selection stays scan-backed and restores row/schema/time metadata; resident selection and retention tests pass. | Done |
| B15 | Release plan-cache locks before source resolution/compilation; count only row-changing preview stages. | Concurrent cache misses can compile independently; exact impacts remain correct; preview scan-count regression passes. | Done |
| B16 | Count float distinct values in the sorted quantile vector rather than a parallel HashSet. | Exact numeric fixtures, signed-zero/nonfinite semantics, and high-cardinality profile benchmark pass. | Done |
| B17 | Split context resolution, preview, code generation, and handoff execution into focused modules; remove unreachable correlation HTTP fallbacks. | Route/API and benchmark consumers keep behavior; module and workspace checks pass. | Done |

## Measured performance

- B05: the optimized Criterion run for 69,680 rows × eight signals measured 1.6517–1.6922 s for an all-mode matrix. The configured work estimate is 18.8M of 25M units; wider requests remain subject to the pair-count limit. LTO was disabled for the local benchmark build.
- B16: exact profiling of 100,000 high-cardinality floating-point values measured 3.0057–3.1487 ms before and 867.00–945.94 µs after. On the added one-million-row fixture, a temporary HashSet reference path measured 134.82–177.44 ms and 57,340 KiB peak RSS; the sorted-transition implementation measured 14.66–16.98 ms and 32,888 KiB. The measured process peak fell by 24,452 KiB (about 42.7%). RSS includes the Criterion process and resident fixture, so treat it as a matched process-level comparison rather than an isolated allocation measurement. Criterion reported a statistically significant time improvement. LTO was disabled for the local benchmark build.

## Initial implementation validation

- `cargo fmt --all -- --check` and `git diff --check` passed.
- `cargo clippy --workspace --all-targets --offline -- -D warnings` passed.
- `cargo test --workspace --offline` passed: 426 tests across workspace unit, API integration, audit, and utility suites; doc tests also passed.
- The B16 Criterion benchmark ran against the one-million-row high-cardinality fixture for both the HashSet reference path and the optimized implementation. The final optimized metadata source was restored byte-for-byte after the reference run and the benchmark was rebuilt and rerun.

## Pre-commit review follow-up

The follow-up review reproduced five gaps with six failing service regressions while the existing 163 service tests passed. The fixes are:

- **B03:** Round inclusive Date-window lower bounds up and upper bounds down so partial-day requests exclude observations outside the viewport.
- **B04:** Persist the plan's selected time column for resident prepared datasets and their repository metadata. Handoff manifests use the same selected column for before/after bounds.
- **B05:** Apply row-pair budgets to the resolved working plan with a bounded `limit + 1` collection. Reject oversized requests before correlation calculation; accept filtered and retained sources independently of the active source's size. Reserve complete column-name storage and reconcile actual result capacities before cache publication.
- **B11:** Run handoff profile summaries through the bounded CPU executor. Move lazy Parquet finalization, including whole-file fingerprinting, onto the bounded I/O lane; carry cleanup ownership through queued, running, and returned work until the artifact is activated.
- **B12:** Strengthen the restoration test to require a Parquet scan and exercise an artifact larger than its configured resident-memory allowance.

The follow-up adds 11 regression tests, including exact correlation budget boundaries, actual cache-byte accounting, stale cache producers, selected-time propagation, I/O admission, and unpublished-artifact cleanup.

### Final review validation

- `cargo test --workspace --all-features --offline --jobs 2`: **437 passed**, with all doc tests passing.
- `cargo clippy --workspace --all-targets --all-features --offline -- -D warnings`: passed.
- `cargo fmt --all -- --check` and `git diff --check`: passed.

**Commit assessment:** ready to commit the reviewed backend changes, including the new cleaning modules, benchmark, and regression coverage. No blocking finding remains in this review.
