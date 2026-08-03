# Developer Workflows

## Core Local Commands

### Run The App

```bash
cargo run -p edatime-bin --bin edatime
```

### Live Frontend Development

```bash
make dev
```

This starts the Rust API on port `3000` and the Vite frontend on port `5173`.
Open <http://127.0.0.1:5173> while editing frontend CSS or TypeScript so Vite
serves source assets directly and applies CSS/HMR updates without rebuilding
`crates/edatime-bin/frontend/dist/`.

To test the packaged frontend bundle that the Rust server serves directly, use:

```bash
make dev-dist
```

### Validate Backend And Frontend

```bash
cargo fmt --check
cargo check --all-targets
cargo test
npm run check:frontend:all
npm run check:frontend:budgets
```

### Optional Node-Based Frontend Workflow

```bash
npm run check:frontend
npm run typecheck
npm run build:frontend
npm run build:frontend:prod
```

## Documentation Workflow

Install docs dependencies:

```bash
python -m pip install -r docs/requirements.txt
```

Build the HTML docs:

```bash
python -m sphinx -b html docs docs/_build/html
```

Or use the Make target:

```bash
make docs
```

## When To Rebuild The Frontend Bundle

Rebuild `crates/edatime-bin/frontend/dist/` with `npm run build:frontend` whenever you change:

- anything under `frontend/src/`
- bundle entry wiring
- runtime import paths
- generated app behavior that the browser consumes directly

During normal local UI iteration, prefer `make dev` and the Vite URL instead of
rebuilding the bundle after every CSS or TypeScript edit.

## Suggested Change Checklist

### Backend changes

1. Run `cargo check --all-targets`.
2. Run relevant tests.
3. Update API and architecture docs if contracts changed.

### Frontend changes

1. Run `npm run build:frontend` or `npm run check:frontend`.
2. Verify the page visually in a browser.
3. Update user docs if the workflow changed.

### Documentation changes

1. Build Sphinx locally.
2. Fix warnings and broken links.
3. Keep the README and long-form guides aligned with the docs site.
