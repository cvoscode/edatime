# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Copilot, …) working in this repo.
Keep it accurate: when you change a command, a layout rule, or a check, update
this file in the same change.

## What this is

edatime is a self-hosted, browser-based exploratory data analysis tool for time
series. Users load a CSV or Parquet file and inspect it across pages: Overview,
Data source (upload), Signals (time series), Preparation (cleaning), Correlation
matrix, Pair plot, Spectrum (FFT), Time-frequency (spectrogram), Heatmap,
Causality, and Drift.

- **Backend:** Rust workspace (edition 2024, MSRV 1.88). Axum, Tokio, Polars
  (LazyFrame-first), Arrow IPC for data transport.
- **Frontend:** framework-free TypeScript with plain HTML and CSS, bundled by
  Vite. Charts use ChartGPU (WebGPU, vendored at `frontend/libs/chartgpu`) and
  ECharts.
- One binary (`edatime`) serves the API under `/api/v1` and the packaged
  frontend.

## Running

```bash
npm ci          # once
make dev        # Rust API on :3000 + Vite on :5173. Open http://127.0.0.1:5173
```

`make dev` runs `scripts/dev.mjs`: `cargo run -p edatime-bin` alongside Vite,
which proxies `/api` to the backend and gives CSS/TS hot reload. When one
process exits it stops the other. Ports can be changed with `EDATIME_PORT` and
`EDATIME_VITE_PORT`.

- **WSL note:** this machine may have no Linux `node` on `PATH`, and `npm` may
  resolve to the Windows install. The Makefile falls back to VS Code Server's
  bundled node (`~/.vscode-server/bin/*/node`), so prefer `make` targets over
  bare `npm`/`node`. To run a script directly, use that binary:
  `$(ls ~/.vscode-server/bin/*/node | head -1) scripts/<script>.mjs`.
- `make dev-dist` / `make run` serve the production build from
  `crates/edatime-bin/frontend/dist` without Vite.
- `EDATIME_SAMPLE_DATA=path.csv` preloads a dataset. Configuration options are
  in `config.toml.example` and the README.

## Repository layout

```
crates/
  edatime-core/     shared config, errors, metrics, expressions, stats, temporal utils
  edatime-ingest/   CSV/Parquet loading, normalisation, profiling          (→ core)
  edatime-query/    query pipeline, filters, downsampling, cleaning, derived
                    columns, Arrow export, QueryExecutor                    (→ core)
  edatime-store/    repositories, retained datasets, versions, artifacts,
                    caches, jobs, Postgres. No Axum here.                   (→ core, query)
  edatime-service/  Axum routes (handlers/), analytics, causal, middleware,
                    rate limits, streaming export; integration tests in tests/
  edatime-bin/      main.rs: the single executable and HTTP host
contracts/
  api-v1.json       canonical route + schema table (source of truth)
  openapi-v1.json   generated from api-v1.json
frontend/
  index.html        application shell (large; page markup lives here)
  css/style.css     imports css/modules/*.css; design tokens in tokens.css
  src/app.ts        composition root
  src/app/          shell, navigation, boot state, pageModules.ts (lazy page loading)
  src/features/<page>/  one folder per page (timeseries, prepare, scatter, fft, …)
  src/workspace/    workspaceStore.ts: sole owner of cross-feature state
  src/store/        local UI/renderer state only
  src/services/api/ the only place allowed to call fetch
  src/contracts/api/v1/  route ids and DTOs; generated.ts is generated
  src/chart/, src/charts/  chart adapters (ChartGPU/ECharts), export renderers
  src/cleaning/     preparation pipeline: plan compiler, preview, codegen
  src/platform/     page lifecycle, runtime, request tasks, feature events
  src/ui/, src/utils/    shared DOM components and pure helpers
scripts/            build, dev, contract generators, architecture/hygiene checks
tests/              Playwright e2e specs (e2e_*_tests.ts)
docs/               Sphinx/MyST docs: user/, developer/ (one page per app page), reference/
ETTm2.csv           built-in sample dataset. Must stay at repo root (resolved
                    via `data.sample_dir`, default CARGO_MANIFEST_DIR/../.., or EDATIME_SAMPLE_DATA_DIR)
_to_delete/, _unsure/  cleanup holding areas. Ignore them. Don't read or cite them.
```

## Architecture rules

These are enforced by checks. `scripts/check-frontend-architecture.mjs`,
`check-frontend-reachability.mjs`, `check_backend_hygiene.mjs`, and
`check_api_contract.mjs` fail the build.

**Backend**
- Keep route handlers thin: validate, admit work, call query/domain code, map
  the response.
- Keep HTTP types out of `edatime-store` and `edatime-query`.
- Only `crates/edatime-query/src/executor.rs` (`QueryExecutor`) may call
  `tokio::task::spawn_blocking`. Route CPU-heavy Polars and file work through
  the executor (`run_blocking_io` and similar).
- Every public path is `/api/v1/...`. No unversioned `/api/` strings in backend
  source or docs.
- Workspace lints deny `dbg!`, `println!`/`eprintln!`, `todo!`,
  `unimplemented!`, `unwrap()` and `expect()`. `clippy.toml` exempts test code;
  a production `expect` needs a targeted `#[allow(clippy::expect_used)]` and a
  comment explaining why it cannot fail. Use `tracing`. Clippy runs with
  `-D warnings`.
- Two error types exist on purpose: `edatime_core::error::DomainError` (no HTTP
  knowledge, used by core/query/store/ingest) and
  `edatime_service::error::AppError` (owns status codes and the JSON body).
  Internal errors are logged in full but reach clients only as a fixed message.
- Response-cache keys are built with `edatime_store::cache::CacheKeyBuilder`
  (length-prefixed, collision-free); never hand-join columns into a `format!`
  string. Per-source caches use `BoundedMap`; lock std mutexes through
  `lock_recovering` so a poisoned lock does not disable a cache.
- Config env overrides are strict: a set-but-invalid `EDATIME_*` value is a
  startup error, and the binary exits on an unreadable or malformed
  `config.toml` instead of falling back to defaults.
- Route metrics labels come from `contracts/api-v1.json`; unknown `/api/v1/`
  paths share the `unmatched` label. Add new routes to the contract first.
- Profile before tuning. `cargo build --profile profiling` gives a release build
  with line tables. Performance changes need a recorded before/after.

**Frontend**
- `fetch` lives only in `src/services/api/`. Every URL must exist in
  `contracts/api-v1.json`.
- `workspace/workspaceStore.ts` owns dataset identity, selection, filters, and
  viewport intent. Don't add new imports of legacy store modules; the checker
  keeps an allowlist that is meant to shrink.
- Feature pages are loaded on demand through `app/pageModules.ts`. The startup
  shell (`app.ts`, `app/shell*`, `ui/pageNavigation.ts`) must not statically
  import heavy libraries (echarts, apache-arrow, chartgpu, DataChart).
- Every production module must be reachable from `app.ts`. Delete dead modules
  instead of leaving them.
- Retired source roots must not come back: `src/legacy`, `src/bootstrap`,
  `src/pages`, `src/causal`, `src/scatter`, `src/drift`, `src/components`.
- Mount features as disposable instances. Dispose listeners, subscriptions,
  in-flight requests, and chart resources on unmount. No module-level mutable
  controller state.
- Keep pure transforms DOM-free so they can be unit-tested.
- Styling is plain CSS in `frontend/css/modules/`, using tokens from
  `tokens.css`. Don't add Tailwind, Sass, CSS-in-JS, UI frameworks, or new
  dependencies unless asked.
- For UI/UX work, follow `.github/UI.md` (trustworthy analytical context,
  explicit and reversible cleaning, visible error and stale states, full keyboard
  operation).

**Repo hygiene** (`scripts/check-repo-hygiene.mjs`)
- Never commit build output (`crates/edatime-bin/frontend/dist/`, `docs/_build/`),
  source maps, `tmp/`, or `.bak`/`.orig`/`.old` files.
- No backwards-compatibility shims or legacy re-export surfaces.

## Changing the API

1. Add or modify the backend route in
   `crates/edatime-service/src/handlers/routes/`, wired in `routes/mod.rs`.
2. Update `contracts/api-v1.json` (operation and schemas).
3. Regenerate the derived files:
   ```bash
   npm run generate:api-contract            # frontend/src/contracts/api/v1/generated.ts
   npm run generate:openapi                 # contracts/openapi-v1.json
   node scripts/generate_api_reference.mjs  # docs/reference/api.md
   ```
4. Add the route id and DTO types in `frontend/src/contracts/api/v1/` and the
   client call in `frontend/src/services/api/`.
5. Verify with `make check-contract` and `make test-contract`.

## Verification

| Scope | Command |
|---|---|
| Frontend types + arch + reachability + hygiene | `make check-frontend` |
| Frontend unit tests (Vitest, happy-dom) | `make test-frontend` (`npm test`) |
| Single frontend test | `npx vitest run path/to/file.test.ts` |
| Rust compile / lint / tests | `cargo check-all` · `cargo lint` · `cargo test-all` (aliases in `.cargo/config.toml`) |
| Single crate | `cargo test -p edatime-query` |
| API contract | `make check-contract`, `make test-contract` |
| Everything before merge | `make verify` |
| Browser e2e (Playwright, port 3100) | `npm run test:e2e` |

Tests sit next to the code (`*.test.ts` beside the module; Rust `#[cfg(test)]`
modules). API integration tests are in
`crates/edatime-service/tests/api_integration.rs`. Many frontend tests assert
against `frontend/index.html` markup, so markup changes often need test
updates.

## Known issues

- CI (`.github/workflows/ci.yml`) triggers on pushes to `main`, but the default
  branch is `master`, so CI only runs on pull requests.
- `make docs` and Read the Docs expect `docs/conf.py`, but `.gitignore` ignores
  `*.py` and the file doesn't exist. Docs builds are broken until it is added
  (with a `!docs/conf.py` exception).
- Several code comments cite section numbers in `usage_issue.md`, which now
  lives in `_unsure/`.
