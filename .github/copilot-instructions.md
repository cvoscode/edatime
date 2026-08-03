# Copilot Instructions for edatime

edatime is an interactive time-series analytics application. The backend is a
Rust workspace using Axum, Tokio, Polars, Arrow IPC, and tracing. The frontend
is framework-free TypeScript, Vite, plain HTML/CSS, and ChartGPU.

## Architecture

- crates/edatime-bin is the executable and HTTP host.
- crates/edatime-service owns routes, transport mapping, and HTTP policy.
- crates/edatime-query owns reusable query execution and non-HTTP data work.
- crates/edatime-store owns repositories, retained datasets, caches, jobs, and
  other persistence/runtime storage. It must not depend on Axum.
- crates/edatime-core owns shared configuration, errors, metrics, and utility
  primitives.
- contracts/api-v1.json is the canonical versioned route table. All public
  endpoints live under /api/v1.

Frontend source lives in frontend/src and build output lives in
crates/edatime-bin/frontend/dist. Build output is generated and never tracked.
The frontend transport boundary is frontend/src/services/api. Shared route and
DTO identities live in frontend/src/contracts/api/v1.

app.ts is the frontend composition root. Feature modules are loaded on demand
through app/pageModules.ts. workspace/workspaceStore.ts is the only owner of
cross-feature dataset identity, selection, filters, and viewport intent.
Focused modules under store hold local UI and renderer state only. Avoid
module-level mutable feature/controller state; mount features as disposable
instances.

## Coding Guidance

- Keep route handlers thin: validate, admit work, call query/domain code, then
  map the response.
- Keep HTTP types out of store and query crates.
- Use tracing instead of println, and avoid unwrap/expect on production paths.
- Keep CPU-heavy Polars/file work off the async executor through the existing
  execution boundary.
- Keep browser fetch calls inside services/api and add canonical paths to the
  route contract.
- Keep pure frontend transformations DOM-free and dispose listeners,
  subscriptions, requests, and chart resources on unmount.
- Do not add backwards-compatibility shims, legacy import surfaces, generated
  output, source maps, temporary files, or backup files to Git.

## Verification

Run npm run check:frontend:all for frontend type, architecture, reachability,
budget, and asset checks. Run npm test for frontend tests. For backend changes,
run cargo fmt --all -- --check, cargo clippy --workspace --all-targets
--all-features -- -D warnings, and cargo test --workspace --all-features.

Use npm run bench:app:artifacts for bundle output, npm run bench:workspace for
workspace publication behavior, and the documented Cargo/HTTP benchmarks for
backend changes.
