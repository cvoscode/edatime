.PHONY: build build-release run dev dev-dist check test docs docs-clean clean docker

# Default target
build:
	cargo build

build-release:
	cargo build --release

run:
	cargo run --release -p edatime-bin

# Development: run Rust API + Vite frontend so CSS/JS update live.
dev:
	@if command -v node >/dev/null 2>&1; then npm run dev:full; else echo "Node.js is required for live frontend development."; exit 1; fi

# Development against the packaged dist output.
dev-dist:
	rm -rf crates/edatime-bin/frontend/dist
	@if command -v node >/dev/null 2>&1; then node scripts/build-frontend.mjs; fi
	EDATIME_FRONTEND_DIR=$(PWD)/crates/edatime-bin/frontend/dist cargo run -p edatime-bin

# Type-check and lint
check:
	cargo check
	cargo clippy -- -D warnings
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

bench:
	cargo bench

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
