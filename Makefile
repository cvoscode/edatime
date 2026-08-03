.PHONY: build build-release run dev dev-dist check test docs docs-clean clean docker bench-contract bench-http bench-cancel bench-soak check-contract test-contract check-backend-hygiene

# Default target
build:
	cargo build -p edatime-bin --bin edatime

build-release:
	cargo build --release -p edatime-bin --bin edatime

run:
	cargo run --release -p edatime-bin --bin edatime

# Development: run Rust API + Vite frontend so CSS/JS update live.
dev:
	@if command -v node >/dev/null 2>&1; then npm run dev:full; else echo "Node.js is required for live frontend development."; exit 1; fi

# Development against the packaged dist output.
dev-dist:
	rm -rf crates/edatime-bin/frontend/dist
	@if command -v node >/dev/null 2>&1; then node scripts/build-frontend.mjs; fi
	EDATIME_FRONTEND_DIR=$(PWD)/crates/edatime-bin/frontend/dist cargo run -p edatime-bin --bin edatime

# Type-check and lint
check:
	cargo check --workspace --all-targets
	node scripts/check_api_contract.mjs
	node scripts/generate_api_reference.mjs --check
	node scripts/check_backend_hygiene.mjs
	cargo clippy --workspace --all-targets -- -D warnings
	@if command -v node >/dev/null 2>&1; then cd frontend && npx tsc --noEmit; fi
	@if command -v node >/dev/null 2>&1; then node scripts/check-frontend-architecture.mjs; fi

# Frontend architecture checker only (fast iteration)
check-arch:
	@if command -v node >/dev/null 2>&1; then node scripts/check-frontend-architecture.mjs; fi

# Run tests and benchmarks
test:
	cargo test
	@if command -v node >/dev/null 2>&1; then node scripts/check-frontend.mjs; fi
	@if command -v node >/dev/null 2>&1; then node scripts/check-frontend-architecture.mjs; fi

docs:
	.venv/bin/python -m sphinx -b html docs docs/_build/html

docs-clean:
	rm -rf docs/_build

# Phase 0.2: Criterion benches over the deterministic inner loops of
# the four hot paths (scatter, correlations, rolling, plus the existing
# causal bench). See scripts/benchmark.md for the full procedure. Do
# NOT wire this into CI — runner variance dominates the timing
# thresholds.
bench:
	cargo bench

# Convenience target: drive the HTTP workload with the documented
# request mix against an already-running release server. Pass the
# server's PID so the driver can sample RSS.
bench-http:
	@if [ -z "$$EDATIME_TARGET" ]; then echo "EDATIME_TARGET is required, e.g. http://127.0.0.1:3000"; exit 1; fi
	@if [ -z "$$EDATIME_PID" ]; then echo "EDATIME_PID is required, the PID of the running release server"; exit 1; fi
	node scripts/bench_http.mjs run \
	    --target "$$EDATIME_TARGET" \
	    --seconds $${BENCH_SECONDS:-30} \
	    --concurrency $${BENCH_CONCURRENCY:-4} \
	    --scenario $${BENCH_SCENARIO:-steady} \
	    --seed $${BENCH_SEED:-0xA5A5A5A55A5A5A5A} \
	    --out benchmarks/run.http.json
	node scripts/bench_http.mjs snapshot \
	    --target "$$EDATIME_TARGET" \
	    --out benchmarks/run.metrics.json

# Fast correctness gate required before a timed HTTP benchmark.
bench-contract:
	@if [ -z "$$EDATIME_TARGET" ]; then echo "EDATIME_TARGET is required, e.g. http://127.0.0.1:3000"; exit 1; fi
	node scripts/bench_http.mjs preflight \
	    --target "$$EDATIME_TARGET" \
	    --out benchmarks/preflight.json

check-contract:
	node scripts/check_api_contract.mjs
	node scripts/generate_api_reference.mjs --check

test-contract:
	cargo test --test api_integration
	npm test -- frontend/src/services/api/__contract__.test.ts frontend/src/contracts/api/v1/routes.test.ts frontend/src/services/api/http.test.ts

check-backend-hygiene:
	node scripts/check_backend_hygiene.mjs

bench-soak:
	@if [ -z "$$EDATIME_TARGET" ]; then echo "EDATIME_TARGET is required, e.g. http://127.0.0.1:3000"; exit 1; fi
	node scripts/bench_http.mjs run \
	    --target "$$EDATIME_TARGET" \
	    --seconds $${BENCH_SECONDS:-1800} \
	    --concurrency $${BENCH_CONCURRENCY:-16} \
	    --scenario soak \
	    --seed $${BENCH_SEED:-0xA5A5A5A55A5A5A5A} \
	    --out benchmarks/soak.http.json

bench-cancel:
	@if [ -z "$$EDATIME_TARGET" ]; then echo "EDATIME_TARGET is required, e.g. http://127.0.0.1:3000"; exit 1; fi
	node scripts/bench_http.mjs cancel \
	    --target "$$EDATIME_TARGET" \
	    --concurrency $${BENCH_CONCURRENCY:-32} \
	    --out benchmarks/cancellation.http.json

# Build frontend for production (requires Node)
frontend-prod:
	VITE_BUILD_PWA=true node scripts/build-frontend.mjs --prod

# Docker
docker:
	docker build -t edatime .

docker-run:
	docker run --rm -p 3000:3000 edatime

clean:
	cargo clean
