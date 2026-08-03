#!/usr/bin/env node
// HTTP workload driver for the edatime backend benchmark procedure.
//
// Phase 0.2 deliverable. See scripts/benchmark.md for the full procedure.
//
// Usage:
//   scripts/bench_http.mjs upload  --fixture wide_frame   --out /tmp/wide.csv
//   scripts/bench_http.mjs run     --seconds 60 --concurrency 16 \
//                                  --target http://localhost:3000 \
//                                  --out benchmarks/run.http.json
//   scripts/bench_http.mjs snapshot --target http://localhost:3000 \
//                                  --out benchmarks/run.metrics.json
//   scripts/bench_http.mjs csv      --out /tmp/wide.csv --rows 5000 --cols 16
//
// The driver has zero external dependencies — it uses Node's built-in
// fetch (Node 18+) and the filesystem. The script is intentionally
// self-contained so the bench procedure works on a fresh machine
// without an `npm install`.

import { Buffer } from "node:buffer";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import { performance } from "node:perf_hooks";
import process from "node:process";
import path from "node:path";
import { createHash } from "node:crypto";

// ── Argument parsing ────────────────────────────────────────────────────────
//
// Keep this tiny and ad-hoc — we are not building a CLI framework, just a
// benchmark driver.

function parseArgs(argv) {
    const args = {
        cmd: argv[2],
        fixture: null,
        scenario: "steady",
        seconds: 30,
        requests: null,
        concurrency: 4,
        target: process.env.EDATIME_TARGET ?? "http://localhost:3000",
        out: null,
        rows: null,
        cols: null,
        seed: "0xA5A5A5A55A5A5A5A",
        pid: null,
        rundown: 15,
        help: false,
    };
    // Treat any leading `--help` (in any position) as a request for help
    // so `bench_http.mjs --help` works the way users expect.
    if (argv.includes("--help")) args.help = true;
    const start = args.cmd && !args.cmd.startsWith("--") ? 3 : 2;
    for (let i = start; i < argv.length; i += 1) {
        const flag = argv[i];
        const value = argv[i + 1];
        switch (flag) {
            case "--fixture": args.fixture = value; i += 1; break;
            case "--scenario": args.scenario = value; i += 1; break;
            case "--seconds": args.seconds = Number(value); i += 1; break;
            case "--requests": args.requests = Number(value); i += 1; break;
            case "--concurrency": args.concurrency = Number(value); i += 1; break;
            case "--target": args.target = value; i += 1; break;
            case "--out": args.out = value; i += 1; break;
            case "--rows": args.rows = Number(value); i += 1; break;
            case "--cols": args.cols = Number(value); i += 1; break;
            case "--seed": args.seed = value; i += 1; break;
            case "--pid": args.pid = Number(value); i += 1; break;
            case "--rundown": args.rundown = Number(value); i += 1; break;
            case "--help": args.help = true; break;
            default: throw new Error(`unknown flag: ${flag}`);
        }
    }
    return args;
}

function printHelp() {
    process.stdout.write(`bench_http.mjs <cmd> [flags]

cmds:
  upload    POST a synthetic CSV fixture to /api/v1/upload
  preflight validate the build, contract, and measured request shapes
  run       drive the request mix at the configured concurrency
  cancel    abort concurrent rolling requests, then verify normal recovery
  snapshot  fetch /api/v1/metrics once and write to --out
  csv       generate a synthetic CSV fixture (no upload)

flags:
  --fixture <name>     tiny_contract | long_numeric | long_1m | wide_frame |
                       wide_5k | wide_100k | categorical_100k | long_10m
  --scenario <name>    steady | data | scatter | correlations | rolling |
                       cold-burst | overload | soak (default steady)
  --seconds <N>        run duration (default 30)
  --requests <N>       fixed request count; overrides the duration stop condition
  --concurrency <N>    concurrent in-flight requests (default 4)
  --target <url>       server base URL (default $EDATIME_TARGET or :3000)
  --out <path>         output path for the result JSON
  --rows <N>           CSV row count (csv + upload)
  --cols <N>           CSV column count (csv + upload)
  --seed <hex>         deterministic seed for the CSV fixture
  --pid <pid>          RSS sample target (defaults to a server pid
                       provided via --pid or the env EDATIME_PID)
  --rundown <seconds>  seconds to wait after the run loop ends before
                       snapshotting metrics, so the spawn_blocking
                       queue can drain and the cpu_admission counters
                       settle (default 15; set 0 to disable)
`);
}

// ── CSV fixture generation ──────────────────────────────────────────────────
//
// These generators MUST stay byte-identical to the Rust Criterion
// `synth_*_frame` builders in crates/edatime-service/benches/*.rs. The
// whole point of the synthetic fixtures is that two hosts running the
// same seed produce the same bytes. Do not add fields the Rust side
// cannot reproduce.

function splitmix64(state) {
    // Mulberry32-style seeded RNG for cross-language determinism.
    let z = BigInt(state) & 0xFFFFFFFFFFFFFFFFn;
    z = (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n & 0xFFFFFFFFFFFFFFFFn;
    z = (z ^ (z >> 27n)) * 0x94D049BB133111EBn & 0xFFFFFFFFFFFFFFFFn;
    z = z ^ (z >> 31n);
    return Number(z & 0xFFFFFFFFn);
}

function lcgNext(state) {
    // LCG matching the Rust `next_noise` shim used by the Criterion
    // benches so CSV bytes line up with the synthetic data those benches
    // consume. Mirrors the constants in
    // crates/edatime-service/benches/{scatter_sample,rolling_bands,correlations}.rs.
    const next = (BigInt(state) * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    return next;
}

function noise01(state) {
    // Returns a uniform number in [0, 1) using the same shift convention
    // as the Rust `((state >> 33) as f64) / (u32::MAX as f64) - 0.5`.
    const shifted = Number((BigInt(state) >> 33n) & 0xFFFFFFFFn);
    return shifted / 0xFFFFFFFF - 0.5;
}

function generateLongNumeric({ rows, cols, seedHex }) {
    let state = BigInt(seedHex) + BigInt(rows);
    const header = ["ts"];
    for (let j = 0; j < cols; j += 1) header.push(`v${j}`);
    const lines = [header.join(",")];
    for (let i = 0; i < rows; i += 1) {
        const row = [String(i)]; // ms-step ts; matches the Rust `i as i64`.
        for (let j = 0; j < cols; j += 1) {
            const trend = Math.sin(i * 0.0001 + j * 0.17);
            const quarterly = Math.cos(((i % 1440) / 1440) * 2 * Math.PI);
            const next = lcgNext(state);
            state = next;
            const noise = noise01(next);
            const value = 100 + trend * 30 + quarterly * 5 + noise * 0.5;
            row.push(value.toFixed(6));
        }
        lines.push(row.join(","));
    }
    return lines.join("\n") + "\n";
}

function generateWideFrame({ rows, cols, seedHex }) {
    let state = BigInt(seedHex) + BigInt(rows) + BigInt(cols);
    const header = ["ts"];
    for (let j = 0; j < cols; j += 1) header.push(`c${j}`);
    const lines = [header.join(",")];
    for (let i = 0; i < rows; i += 1) {
        const row = [String(i)];
        for (let j = 0; j < cols; j += 1) {
            const trend = Math.cos(i * 0.001 + j * 0.5);
            const shared = Math.sin(i * 0.0003) * Math.cos(j * 0.2) * 25;
            const next = lcgNext(state);
            state = next;
            const noise = noise01(next);
            const value = 50 + trend * 15 + shared + noise;
            row.push(value.toFixed(6));
        }
        lines.push(row.join(","));
    }
    return lines.join("\n") + "\n";
}

function generateTinyContract({ rows, seedHex }) {
    let state = BigInt(seedHex);
    const lines = ["ts,value,secondary,category"];
    for (let index = 0; index < rows; index += 1) {
        state = lcgNext(state);
        const value = index % 17 === 0 ? "" : index % 29 === 0 ? "NaN" : (noise01(state) * 10).toFixed(6);
        lines.push(`${index},${value},${(index * 0.25).toFixed(3)},category-${index % 7}`);
    }
    return lines.join("\n") + "\n";
}

function generateCategorical({ rows, seedHex }) {
    const base = generateWideFrame({ rows, cols: 2, seedHex }).trimEnd().split("\n");
    base[0] += ",color";
    for (let index = 1; index < base.length; index += 1) {
        base[index] += `,category-${(index - 1) % 1_000}`;
    }
    return base.join("\n") + "\n";
}

function fixtureSpec(name, requestedRows, requestedCols) {
    const specs = {
        tiny_contract: { generator: generateTinyContract, rows: 100, cols: 3, policy: "mixed null and non-finite numeric values; seven categories" },
        long_numeric: { generator: generateLongNumeric, rows: 1_048_576, cols: 3, policy: "finite deterministic numeric series" },
        long_1m: { generator: generateLongNumeric, rows: 1_048_576, cols: 8, policy: "finite deterministic numeric series" },
        wide_frame: { generator: generateWideFrame, rows: 5_000, cols: 16, policy: "finite deterministic wide frame" },
        wide_5k: { generator: generateWideFrame, rows: 5_000, cols: 16, policy: "finite deterministic wide frame" },
        wide_100k: { generator: generateWideFrame, rows: 100_000, cols: 64, policy: "finite deterministic wide frame" },
        categorical_100k: { generator: generateCategorical, rows: 100_000, cols: 3, policy: "1,000 deterministic categorical labels" },
        long_10m: { generator: generateLongNumeric, rows: 10_000_000, cols: 8, policy: "finite deterministic numeric series; enable managed artifacts to benchmark Parquet-backed retention" },
    };
    const spec = specs[name];
    if (!spec) throw new Error(`unknown fixture: ${name}`);
    return {
        ...spec,
        rows: requestedRows ?? spec.rows,
        cols: requestedCols ?? spec.cols,
    };
}

function fixtureManifest(args, spec, csv) {
    return {
        fixture: args.fixture,
        seed: args.seed,
        rows: spec.rows,
        columns: spec.cols + 1,
        schema: "CSV header is authoritative; ts is integer milliseconds",
        null_non_finite_policy: spec.policy,
        sha256: createHash("sha256").update(csv).digest("hex"),
        bytes: Buffer.byteLength(csv),
    };
}

// ── Multipart upload helper ─────────────────────────────────────────────────

function buildMultipart({ boundary, fileFieldName, fileName, fileBytes, fields }) {
    // Matches the exact shape used by tests/api_integration.rs.
    const chunks = [];
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
        Buffer.from(
            `Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\n`,
        ),
    );
    chunks.push(Buffer.from("Content-Type: text/csv\r\n\r\n"));
    chunks.push(fileBytes);
    chunks.push(Buffer.from("\r\n"));
    for (const [name, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(
            Buffer.from(
                `Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
            ),
        );
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return Buffer.concat(chunks);
}

// ── Subcommand: upload ──────────────────────────────────────────────────────

async function cmdUpload(args) {
    if (!args.fixture) throw new Error("--fixture is required for upload");
    if (!args.out) throw new Error("--out is required for upload");

    const spec = fixtureSpec(args.fixture, args.rows, args.cols);
    const { rows, cols } = spec;
    const csv = spec.generator({ rows, cols, seedHex: args.seed });
    await writeFile(args.out, csv);
    const manifest = fixtureManifest(args, spec, csv);
    await writeFile(`${args.out}.manifest.json`, JSON.stringify(manifest, null, 2));

    const boundary = "----FormBoundary7MA41YWsqSbuR0OH";
    const body = buildMultipart({
        boundary,
        fileFieldName: "file",
        fileName: `${args.fixture}.csv`,
        fileBytes: Buffer.from(csv),
        // The synthetic fixtures use an integer `ts` column so Polars
        // auto-detection can't classify it as Datetime/Date at scan time.
        // Pin the time column explicitly so `load_dataframe_partial` casts
        // it through the seconds→ms probe path. See
        // `crates/edatime-ingest/src/ingest.rs::load_dataframe_partial`
        // for the contract.
        fields: {
            n_rows: String(rows),
            time_column: "ts",
        },
    });

    const url = `${args.target.replace(/\/$/, "")}/api/v1/upload`;
    const start = performance.now();
    const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        body,
    });
    const text = await resp.text();
    const elapsedMs = performance.now() - start;
    const result = {
        cmd: "upload",
        fixture: args.fixture,
        rows,
        cols,
        csv_path: args.out,
        status: resp.status,
        elapsed_ms: Math.round(elapsedMs),
        response_preview: text.slice(0, 512),
        manifest,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (resp.status >= 400) {
        throw new Error(`upload failed with status ${resp.status}`);
    }
}

// ── Subcommand: csv (generator only) ────────────────────────────────────────

async function cmdCsv(args) {
    if (!args.out) throw new Error("--out is required for csv");
    if (!args.fixture) {
        // Default to wide_frame when generating a CSV file standalone.
        args.fixture = "wide_frame";
    }
    const spec = fixtureSpec(args.fixture, args.rows, args.cols);
    const csv = spec.generator({
        rows: spec.rows,
        cols: spec.cols,
        seedHex: args.seed,
    });
    await writeFile(args.out, csv);
    const manifest = fixtureManifest(args, spec, csv);
    await writeFile(`${args.out}.manifest.json`, JSON.stringify(manifest, null, 2));
    process.stdout.write(
        JSON.stringify({
            cmd: "csv",
            fixture: args.fixture,
            rows: spec.rows,
            cols: spec.cols,
            out: args.out,
            manifest,
        }) + "\n",
    );
}

// ── Subcommand: run (request mix) ───────────────────────────────────────────

const REQUEST_MIXES = {
  steady: [
    { route: "data", weight: 70 },
    { route: "scatter_points", weight: 20 },
    { route: "scatter_correlations", weight: 10 },
  ],
  data: [{ route: "data", weight: 1 }],
  scatter: [{ route: "scatter_points", weight: 1 }],
  correlations: [{ route: "scatter_correlations", weight: 1 }],
  rolling: [{ route: "rolling", weight: 1 }],
  "cold-burst": [{ route: "data", weight: 1 }],
  overload: [
    { route: "data", weight: 35 },
    { route: "scatter_points", weight: 25 },
    { route: "scatter_correlations", weight: 20 },
    { route: "rolling", weight: 20 },
  ],
  soak: [
    { route: "data", weight: 55 },
    { route: "scatter_points", weight: 20 },
    { route: "scatter_correlations", weight: 15 },
    { route: "rolling", weight: 10 },
  ],
};

function requestMix(scenario) {
    const mix = REQUEST_MIXES[scenario];
    if (!mix) throw new Error(`unknown scenario: ${scenario}`);
    return mix;
}

function makeRng(seedHex) {
    let state = BigInt(seedHex);
    return () => {
        state = lcgNext(state);
        return Number(state >> 11n) / 9007199254740992;
    };
}

function buildRequest(target, kind, context) {
    const base = target.replace(/\/$/, "");
    const [x, y, color] = context.numericColumns;
    const cleaning_plan = context.cleaningPlan;
    switch (kind) {
        case "data":
            return { url: `${base}/api/v1/data`, body: {
                start: context.bounds.start, end: context.bounds.end, width: 500,
                columns: [x, y, color].filter(Boolean).join(','), format: 'arrow', cleaning_plan,
            }, expectedContentType: 'arrow' };
        case "scatter_points":
            return { url: `${base}/api/v1/scatter/points`, body: {
                x, y, color, limit: 200000, format: 'arrow', cleaning_plan,
            }, expectedContentType: 'arrow' };
        case "scatter_correlations":
            return { url: `${base}/api/v1/scatter/correlations`, body: {
                base: x, threshold: 0.5, mode: 'pearson_raw', cleaning_plan,
            }, expectedContentType: 'json' };
        case "rolling":
            return { url: `${base}/api/v1/analytics/rolling`, body: {
                start: context.bounds.start, end: context.bounds.end,
                columns: [x, y].join(','), window: 50, cleaning_plan,
            }, expectedContentType: 'json' };
    }
}

async function probeBenchmarkContext(target) {
    const base = target.replace(/\/$/, '');
    const [buildResp, contractResp, metadataResp] = await Promise.all([
        fetch(`${base}/api/v1/build`),
        fetch(`${base}/api/v1/contract`),
        fetch(`${base}/api/v1/metadata`),
    ]);
    if (!buildResp.ok || !contractResp.ok || !metadataResp.ok) {
        throw new Error(`benchmark preflight failed: build=${buildResp.status}, contract=${contractResp.status}, metadata=${metadataResp.status}`);
    }
    const [build, contract, metadata] = await Promise.all([
        buildResp.json(), contractResp.json(), metadataResp.json(),
    ]);
    if (build.contract_version !== contract.version) throw new Error('server build and API contract versions differ');
    if (!metadata.source_version_id || !metadata.schema_fingerprint || !metadata.time_column) {
        throw new Error('metadata lacks immutable dataset identity; upload a fixture before benchmarking');
    }
    if (!Array.isArray(metadata.numeric_columns) || metadata.numeric_columns.length < 2) {
        throw new Error('benchmark requires at least two numeric columns');
    }
    const range = metadata.time_range;
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) {
        throw new Error('metadata lacks a valid time range');
    }
    const now = new Date().toISOString();
    const revision = metadata.source_version_revision ?? metadata.revision;
    return {
        build,
        contractVersion: contract.version,
        numericColumns: metadata.numeric_columns.slice(0, 3),
        bounds: { start: new Date(range.min).toISOString(), end: new Date(range.max).toISOString() },
        cleaningPlan: {
            plan: {
                schemaVersion: 1, id: 'http-benchmark', planRevision: 1,
                sourceVersionId: metadata.source_version_id, datasetRevision: revision,
                datasetFingerprint: metadata.dataset_fingerprint ?? null,
                schemaFingerprint: metadata.schema_fingerprint, timeColumn: metadata.time_column,
                sourceName: metadata.source_name ?? null, stages: [], createdAt: now, updatedAt: now,
            },
            expectedPlanHash: null,
            expectedSourceVersionId: metadata.source_version_id,
            expectedDatasetRevision: revision,
        },
    };
}

async function executeMeasuredRequest(request, abortAfterMs = null) {
    const t0 = performance.now();
    const controller = abortAfterMs == null ? null : new AbortController();
    const abortTimer = controller == null
        ? null
        : setTimeout(() => controller.abort(), abortAfterMs);
    try {
        const resp = await fetch(request.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: request.expectedContentType === 'arrow' ? 'application/vnd.apache.arrow.stream' : 'application/json' },
            body: JSON.stringify(request.body),
            signal: controller?.signal,
        });
        const buffer = new Uint8Array(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') ?? '';
        const expectedType = request.expectedContentType === 'arrow' ? 'arrow' : 'json';
        const contentTypeOk = expectedType === 'arrow' ? contentType.includes('arrow') : contentType.includes('json');
        const provenanceOk = ['x-edatime-source-version', 'x-edatime-source-revision', 'x-edatime-schema-fingerprint', 'x-edatime-plan-hash']
            .every((header) => Boolean(resp.headers.get(header)));
        let errorCode = null;
        if (!resp.ok && contentType.includes('json')) {
            try { errorCode = JSON.parse(Buffer.from(buffer).toString('utf8')).code ?? null; } catch { /* bounded diagnostic only */ }
        }
        return { status: resp.status, latency_ms: performance.now() - t0, bytes: buffer.byteLength, content_type_ok: contentTypeOk, provenance_ok: provenanceOk, error_code: errorCode };
    } catch (error) {
        const aborted = controller?.signal.aborted || error?.name === 'AbortError';
        return { status: -1, latency_ms: performance.now() - t0, bytes: 0, content_type_ok: false, provenance_ok: false, error_code: aborted ? 'client_aborted' : 'transport_error' };
    } finally {
        if (abortTimer != null) clearTimeout(abortTimer);
    }
}

async function cmdPreflight(args) {
    const context = await probeBenchmarkContext(args.target);
    const results = {};
    for (const kind of ['data', 'scatter_points', 'scatter_correlations', 'rolling']) {
        results[kind] = await executeMeasuredRequest(buildRequest(args.target, kind, context));
    }
    const failures = Object.entries(results).filter(([, sample]) => sample.status < 200 || sample.status >= 300 || !sample.content_type_ok || !sample.provenance_ok);
    const output = { cmd: 'preflight', target: args.target, build: context.build, contract_version: context.contractVersion, results };
    if (args.out) await writeFile(args.out, JSON.stringify(output, null, 2));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (failures.length) throw new Error(`preflight failed for: ${failures.map(([kind]) => kind).join(', ')}`);
}

function pickKind(rng, mix) {
    let total = 0;
    for (const entry of mix) total += entry.weight;
    const target = rng() * total;
    let acc = 0;
    for (const entry of mix) {
        acc += entry.weight;
        if (target <= acc) return entry.route;
    }
    return mix[mix.length - 1].route;
}

function percentile(sorted, q) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(q * (sorted.length - 1))),
    );
    return sorted[idx];
}

async function cmdRun(args) {
    if (!args.out) throw new Error("--out is required for run");

    // Probe a small metadata request first so we can size the run window
    // against the actual dataset's time range when present. When the
    // server has no dataset yet (run started before upload) we fall back
    // to a default window so requests still exercise the routes.
    const context = await probeBenchmarkContext(args.target);
    const mix = requestMix(args.scenario);
    const rng = makeRng(args.seed);
    const startMetrics = await fetchMetrics(args.target);
    // Capture both wall-clock and monotonic start separately so the run
    // mix maths uses a stable monotonic clock while the `started_at`
    // field is a real ISO-8601 timestamp. `performance.now()` is
    // ms-since-process-start; passing it to `new Date(...)` interprets it
    // as Unix ms-since-epoch and produces a "1970-01-01" timestamp for
    // early-start runs.
    const start = performance.now();
    const end = start + args.seconds * 1000;
    const runStartedAt = new Date().toISOString();

    const samples = [];
    const rssSamples = [];
    let rollingCounter = 0;
    let nextRollingMs = start;
    // Resolve the RSS target: explicit `--pid` flag > $BENCH_PID > $EDATIME_PID.
    // We do not raise an error when nothing is set — RSS is optional and the
    // procedure stays usable on hosts that do not expose `/proc/<pid>/status`.
    const rssCandidates = [
        args.pid,
        process.env.BENCH_PID,
        process.env.EDATIME_PID,
    ];
    // Reject null/undefined/empty so the first candidate wins only when it
    // is a real positive integer string. Without the null guard `args.pid`
    // (default `null`) would shadow the env var and the sampler would be
    // silently disabled.
    const rssPidRaw = rssCandidates.find(
        (value) => value != null && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0,
    );
    const rssPid = Number(rssPidRaw ?? NaN);
    const rssPidIsValid = Number.isFinite(rssPid) && rssPid > 0;

    const rssTimer = setInterval(() => {
        if (!rssPidIsValid) return;
        const rss = readRssBytes(rssPid);
        if (rss != null) rssSamples.push({ t: performance.now() - start, rss_bytes: rss });
    }, 1000);

    const fixedSchedule = args.requests == null
        ? null
        : Array.from({ length: args.requests }, (_, index) => {
            if (args.scenario === 'steady' && index < 4) return ['data', 'scatter_points', 'scatter_correlations', 'rolling'][index];
            return pickKind(rng, mix);
        });
    let scheduleIndex = 0;

    async function dispatchOnce(scheduledKind = null) {
        // Mix in a small fraction of rolling requests at low frequency, so
        // the workload is not dominated by /data.
        let kind;
        if (scheduledKind) {
            kind = scheduledKind;
        } else if (rollingCounter < args.seconds && performance.now() >= nextRollingMs) {
            kind = "rolling";
            rollingCounter += 1;
            nextRollingMs = start + rollingCounter * (args.seconds * 1000) / Math.max(1, args.seconds);
        } else {
            kind = pickKind(rng, mix);
        }
        const sample = await executeMeasuredRequest(buildRequest(args.target, kind, context));
        samples.push({ kind, ...sample });
    }

    async function workerLoop() {
        while (true) {
            let kind = null;
            if (fixedSchedule) {
                if (scheduleIndex >= fixedSchedule.length) break;
                kind = fixedSchedule[scheduleIndex];
                scheduleIndex += 1;
            } else if (performance.now() >= end) {
                break;
            }
            // Awaiting here is the concurrency bound: exactly one in-flight
            // request per worker, with no hidden promise backlog.
            await dispatchOnce(kind);
        }
    }

    const workers = Array.from({ length: args.concurrency }, () => workerLoop());
    await Promise.all(workers);
    const loadElapsedSeconds = (performance.now() - start) / 1000;
    clearInterval(rssTimer);

    // Drain the spawn_blocking queue so the cpu_admission counters
    // settle before we take the end-of-run snapshot. The HTTP handler
    // records `submit` synchronously and `started`/`completed` inside
    // the spawned closure; if we snapshot immediately we can see
    // submitted > started with no bug to chase. Wait up to
    // `--rundown` seconds for `pending = submitted - started -
    // completed` to reach zero, polling metrics every second.
    let endMetrics = null;
    if (args.rundown > 0) {
        const rundownEnd = performance.now() + args.rundown * 1000;
        let lastPending = Infinity;
        let stableSinceMs = null;
        while (performance.now() < rundownEnd) {
            await new Promise((r) => setTimeout(r, 1000));
            const m = await fetchMetrics(args.target);
            if (!m || !m.cpu_admission) continue;
            const submitted = m.cpu_admission.submitted_total ?? 0;
            const started = m.cpu_admission.started_total ?? 0;
            const completed = m.cpu_admission.completed_total ?? 0;
            const queued = submitted - started;
            const running = started - completed;
            const pending = queued + running;
            if (pending === lastPending) {
                if (stableSinceMs === null) stableSinceMs = performance.now();
                if (performance.now() - stableSinceMs >= 2000) break;
            } else {
                lastPending = pending;
                stableSinceMs = null;
            }
            if (pending <= 0) break;
        }
    }
    endMetrics = await fetchMetrics(args.target);
    if (endMetrics && endMetrics.cpu_admission) {
        const { submitted_total: s, started_total: st, completed_total: c } = endMetrics.cpu_admission;
        const queued = Math.max(0, (s ?? 0) - (st ?? 0));
        const running = Math.max(0, (st ?? 0) - (c ?? 0));
        process.stderr.write(
            `[drain] submitted=${s} started=${st} completed=${c} queued=${queued} running=${running}\n`
        );
    }

    // Per-route percentiles.
    const byRoute = {};
    for (const sample of samples) {
        (byRoute[sample.kind] ??= []).push(sample);
    }
    const perRoute = {};
    for (const [kind, arr] of Object.entries(byRoute)) {
        const sorted = arr.map((s) => s.latency_ms).sort((a, b) => a - b);
        perRoute[kind] = {
            requests: arr.length,
            errors: arr.filter((s) => s.status < 200 || s.status >= 300 || !s.content_type_ok || !s.provenance_ok).length,
            status_classes: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`${n}xx`, arr.filter((s) => Math.floor(s.status / 100) === n).length])),
            error_codes: [...new Set(arr.map((s) => s.error_code).filter(Boolean))].slice(0, 10),
            p50_ms: percentile(sorted, 0.5),
            p95_ms: percentile(sorted, 0.95),
            p99_ms: percentile(sorted, 0.99),
            bytes_total: arr.reduce((acc, s) => acc + s.bytes, 0),
        };
    }
    const allSorted = samples.map((s) => s.latency_ms).sort((a, b) => a - b);
    const rssSorted = rssSamples.map((s) => s.rss_bytes).sort((a, b) => a - b);

    const result = {
        cmd: "run",
        target: args.target,
        seconds: args.seconds,
        configured_requests: args.requests,
        concurrency: args.concurrency,
        scenario: args.scenario,
        seed: args.seed,
        build: context.build,
        contract_version: context.contractVersion,
        rundown_seconds: args.rundown,
        total_requests: samples.length,
        load_elapsed_seconds: loadElapsedSeconds,
        throughput_rps: samples.length / loadElapsedSeconds,
        per_route: perRoute,
        aggregate: {
            p50_ms: percentile(allSorted, 0.5),
            p95_ms: percentile(allSorted, 0.95),
            p99_ms: percentile(allSorted, 0.99),
        },
        peak_rss_bytes: rssSorted.length ? rssSorted[rssSorted.length - 1] : 0,
        p95_rss_bytes: percentile(rssSorted, 0.95),
        cpu_admission_pending: endMetrics && endMetrics.cpu_admission
            ? {
                queued: Math.max(0,
                    (endMetrics.cpu_admission.submitted_total ?? 0)
                    - (endMetrics.cpu_admission.started_total ?? 0)),
                running: Math.max(0,
                    (endMetrics.cpu_admission.started_total ?? 0)
                    - (endMetrics.cpu_admission.completed_total ?? 0)),
            }
            : null,
        metrics_start: startMetrics,
        metrics_end: endMetrics,
        metrics_delta: numericDelta(startMetrics, endMetrics),
        ts_bounds_used: context.bounds,
        started_at: runStartedAt,
    };
    await writeFile(args.out, JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    const failures = Object.entries(perRoute).filter(([, route]) => route.requests === 0 || route.errors !== 0);
    if (failures.length) throw new Error(`benchmark correctness gate failed: ${failures.map(([kind]) => kind).join(', ')}`);
}

async function cmdCancel(args) {
    if (!args.out) throw new Error("--out is required for cancel");
    const context = await probeBenchmarkContext(args.target);
    const startMetrics = await fetchMetrics(args.target);
    const request = buildRequest(args.target, 'rolling', context);
    const cancelled = await Promise.all(
        Array.from({ length: args.concurrency }, () => executeMeasuredRequest(request, 5)),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    const recovery = await executeMeasuredRequest(buildRequest(args.target, 'data', context));
    const endMetrics = await fetchMetrics(args.target);
    const result = {
        cmd: 'cancel',
        target: args.target,
        concurrency: args.concurrency,
        aborted_requests: cancelled.filter((sample) => sample.error_code === 'client_aborted').length,
        cancellation_latency_ms: cancelled.map((sample) => sample.latency_ms),
        recovery,
        metrics_delta: numericDelta(startMetrics, endMetrics),
    };
    await writeFile(args.out, JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.aborted_requests === 0) throw new Error('cancellation scenario did not abort any request');
    if (recovery.status < 200 || recovery.status >= 300 || !recovery.content_type_ok || !recovery.provenance_ok) {
        throw new Error('normal request did not recover after cancellation burst');
    }
}

function numericDelta(start, end) {
    if (typeof start === 'number' && typeof end === 'number') return end - start;
    if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return null;
    const result = {};
    for (const key of Object.keys(end)) {
        const delta = numericDelta(start[key], end[key]);
        if (delta !== null && (typeof delta !== 'object' || Object.keys(delta).length)) result[key] = delta;
    }
    return result;
}

// ── Subcommand: snapshot ────────────────────────────────────────────────────

async function fetchMetrics(target) {
    try {
        const resp = await fetch(`${target.replace(/\/$/, "")}/api/v1/metrics`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

async function cmdSnapshot(args) {
    if (!args.out) throw new Error("--out is required for snapshot");
    const snap = await fetchMetrics(args.target);
    await writeFile(args.out, JSON.stringify(snap, null, 2));
    process.stdout.write(JSON.stringify(snap, null, 2) + "\n");
}

// ── RSS sampling (Linux-only) ───────────────────────────────────────────────

function readRssBytes(pid) {
    // Linux-only. Reads `VmRSS` from `/proc/<pid>/status` and returns
    // it in bytes. Returns `null` on any read failure so the caller can
    // skip the sample without branching on platform-specific code.
    if (!pid || !Number.isFinite(pid) || pid <= 0) return null;
    const statusPath = `/proc/${pid}/status`;
    if (!existsSync(statusPath)) return null;
    try {
        const fd = openSync(statusPath, "r");
        const buf = Buffer.alloc(2048);
        const n = readSync(fd, buf, 0, buf.length, 0);
        closeSync(fd);
        const text = buf.toString("utf8", 0, n);
        const match = text.match(/VmRSS:\s+(\d+)\s+kB/);
        if (!match) return null;
        return Number(match[1]) * 1024;
    } catch {
        return null;
    }
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    if (!args.cmd) {
        printHelp();
        process.exit(2);
    }
    switch (args.cmd) {
        case "upload": await cmdUpload(args); break;
        case "preflight": await cmdPreflight(args); break;
        case "run": await cmdRun(args); break;
        case "cancel": await cmdCancel(args); break;
        case "snapshot": await cmdSnapshot(args); break;
        case "csv": await cmdCsv(args); break;
        default:
            process.stderr.write(`unknown cmd: ${args.cmd}\n`);
            printHelp();
            process.exit(2);
    }
}

main().catch((err) => {
    process.stderr.write(`error: ${err?.stack ?? err}\n`);
    process.exit(1);
});
