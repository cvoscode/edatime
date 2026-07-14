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

// ── Argument parsing ────────────────────────────────────────────────────────
//
// Keep this tiny and ad-hoc — we are not building a CLI framework, just a
// benchmark driver.

function parseArgs(argv) {
    const args = {
        cmd: argv[2],
        fixture: null,
        seconds: 30,
        concurrency: 4,
        target: process.env.EDATIME_TARGET ?? "http://localhost:3000",
        out: null,
        rows: 5000,
        cols: 16,
        seed: "0xA5A5A5A55A5A5A5A",
        pid: null,
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
            case "--seconds": args.seconds = Number(value); i += 1; break;
            case "--concurrency": args.concurrency = Number(value); i += 1; break;
            case "--target": args.target = value; i += 1; break;
            case "--out": args.out = value; i += 1; break;
            case "--rows": args.rows = Number(value); i += 1; break;
            case "--cols": args.cols = Number(value); i += 1; break;
            case "--seed": args.seed = value; i += 1; break;
            case "--pid": args.pid = Number(value); i += 1; break;
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
  run       drive the request mix at the configured concurrency
  snapshot  fetch /api/v1/metrics once and write to --out
  csv       generate a synthetic CSV fixture (no upload)

flags:
  --fixture <name>     long_numeric | wide_frame (upload cmd)
  --seconds <N>        run duration (default 30)
  --concurrency <N>    concurrent in-flight requests (default 4)
  --target <url>       server base URL (default $EDATIME_TARGET or :3000)
  --out <path>         output path for the result JSON
  --rows <N>           CSV row count (csv + upload)
  --cols <N>           CSV column count (csv + upload)
  --seed <hex>         deterministic seed for the CSV fixture
  --pid <pid>          RSS sample target (defaults to a server pid
                       provided via --pid or the env EDATIME_PID)
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

    const generator =
        args.fixture === "long_numeric"
            ? generateLongNumeric
            : args.fixture === "wide_frame"
                ? generateWideFrame
                : null;
    if (!generator) throw new Error(`unknown fixture: ${args.fixture}`);

    const rows = args.fixture === "long_numeric" ? 100_000 : args.rows;
    const cols = args.fixture === "long_numeric" ? 3 : args.cols;
    const csv = generator({ rows, cols, seedHex: args.seed });
    await writeFile(args.out, csv);

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
    const generator =
        args.fixture === "long_numeric" ? generateLongNumeric : generateWideFrame;
    const csv = generator({
        rows: args.rows,
        cols: args.cols,
        seedHex: args.seed,
    });
    await writeFile(args.out, csv);
    process.stdout.write(
        JSON.stringify({
            cmd: "csv",
            fixture: args.fixture,
            rows: args.rows,
            cols: args.cols,
            out: args.out,
            bytes: Buffer.byteLength(csv),
        }) + "\n",
    );
}

// ── Subcommand: run (request mix) ───────────────────────────────────────────

const REQUEST_MIX = [
    { route: "data", weight: 70 },
    { route: "scatter_points", weight: 20 },
    { route: "scatter_correlations", weight: 10 },
];

function buildRequestUrl(target, kind, tsBounds) {
    // Build URLs that match the contract exercised by
    // tests/api_integration.rs. Numeric ranges are pinned so the dataset's
    // time column (`ts` epoch-ms in the synthetic fixtures) is hit on
    // every request.
    const base = target.replace(/\/$/, "");
    switch (kind) {
        case "data":
            return `${base}/api/v1/data?start=${tsBounds.start}&end=${tsBounds.end}&width=500&columns=ts,c0,c1,c2`;
        case "scatter_points":
            return `${base}/api/v1/scatter/points?x=c0&y=c1&color=c2&limit=200000&format=arrow`;
        case "scatter_correlations":
            return `${base}/api/v1/scatter/correlations`;
        case "rolling":
            return `${base}/api/v1/analytics/rolling?start=${tsBounds.start}&end=${tsBounds.end}&columns=c0,c1&window=50`;
        default:
            throw new Error(`unknown route ${kind}`);
    }
}

function pickKind(rng) {
    let total = 0;
    for (const entry of REQUEST_MIX) total += entry.weight;
    const target = rng() * total;
    let acc = 0;
    for (const entry of REQUEST_MIX) {
        acc += entry.weight;
        if (target <= acc) return entry.route;
    }
    return REQUEST_MIX[REQUEST_MIX - 1].route;
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
    const tsBounds = await probeTsBounds(args.target);
    const rng = Math.random; // run mix is not deterministic; that's fine.
    const start = performance.now();
    const end = start + args.seconds * 1000;

    const inflight = new Set();
    const samples = [];
    const rssSamples = [];
    let rollingCounter = 0;
    let nextRollingMs = start;

    const rssTimer = setInterval(() => {
        const rss = readRssBytes();
        if (rss != null) rssSamples.push({ t: performance.now() - start, rss_bytes: rss });
    }, 1000);

    async function dispatchOnce() {
        // Mix in a small fraction of rolling requests at low frequency, so
        // the workload is not dominated by /data.
        let kind;
        if (rollingCounter < args.seconds && performance.now() >= nextRollingMs) {
            kind = "rolling";
            rollingCounter += 1;
            nextRollingMs = start + rollingCounter * (args.seconds * 1000) / Math.max(1, args.seconds);
        } else {
            kind = pickKind(rng);
        }
        const url = buildRequestUrl(args.target, kind, tsBounds);
        const t0 = performance.now();
        let status = 0;
        let bytes = 0;
        try {
            const resp = await fetch(url);
            status = resp.status;
            const buf = new Uint8Array(await resp.arrayBuffer());
            bytes = buf.byteLength;
        } catch (err) {
            status = -1;
            bytes = 0;
        }
        const t1 = performance.now();
        samples.push({ kind, status, latency_ms: t1 - t0, bytes });
    }

    async function workerLoop() {
        while (performance.now() < end) {
            const p = dispatchOnce();
            inflight.add(p);
            p.finally(() => inflight.delete(p));
            // Yield to the event loop so workers can fan out.
            await new Promise((r) => setImmediate(r));
        }
    }

    const workers = Array.from({ length: args.concurrency }, () => workerLoop());
    await Promise.all(workers);
    await Promise.all([...inflight]);
    clearInterval(rssTimer);

    // Snapshot metrics at end so we can correlate with stage telemetry.
    const endMetrics = await fetchMetrics(args.target);

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
            errors: arr.filter((s) => s.status >= 500 || s.status < 0).length,
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
        concurrency: args.concurrency,
        total_requests: samples.length,
        throughput_rps: samples.length / args.seconds,
        per_route: perRoute,
        aggregate: {
            p50_ms: percentile(allSorted, 0.5),
            p95_ms: percentile(allSorted, 0.95),
            p99_ms: percentile(allSorted, 0.99),
        },
        peak_rss_bytes: rssSorted.length ? rssSorted[rssSorted.length - 1] : 0,
        p95_rss_bytes: percentile(rssSorted, 0.95),
        metrics: endMetrics,
        ts_bounds_used: tsBounds,
        started_at: new Date(start).toISOString(),
    };
    await writeFile(args.out, JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
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

async function probeTsBounds(target) {
    // Pull /api/v1/metadata and try to use its time_range.start /
    // time_range.end as bounds. Fall back to a wide window when metadata
    // is unavailable or has no time_range (e.g. server has no dataset).
    const fallback = { start: 0, end: "1704067200000" };
    try {
        const resp = await fetch(`${target.replace(/\/$/, "")}/api/v1/metadata`);
        if (!resp.ok) return fallback;
        const body = await resp.json();
        const range = body?.time_range;
        if (!range || !range.start || !range.end) return fallback;
        return { start: range.start, end: range.end };
    } catch {
        return fallback;
    }
}

async function cmdSnapshot(args) {
    if (!args.out) throw new Error("--out is required for snapshot");
    const snap = await fetchMetrics(args.target);
    await writeFile(args.out, JSON.stringify(snap, null, 2));
    process.stdout.write(JSON.stringify(snap, null, 2) + "\n");
}

// ── RSS sampling (Linux-only) ───────────────────────────────────────────────

function readRssBytes() {
    const pid = process.env.EDATIME_PID;
    if (!pid) return null;
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
        case "run": await cmdRun(args); break;
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
