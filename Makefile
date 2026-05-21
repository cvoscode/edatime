.PHONY: build build-release run dev check test docs docs-clean clean docker

# Default target
build:
	cargo build

build-release:
	cargo build --release

run:
	cargo run --release -p edatime-bin

# Development: build frontend (if Node available) then run in debug mode
dev:
	@if command -v node >/dev/null 2>&1; then node scripts/build-frontend.mjs && rm -rf crates/edatime-bin/frontend/dist && cp -r frontend/dist crates/edatime-bin/frontend/dist; fi
	cargo run -p edatime-bin

# Type-check and lint
check:
	cargo check
	cargo clippy -- -D warnings
	@if command -v node >/dev/null 2>&1; then cd frontend && npx tsc --noEmit; fi

# Run tests and benchmarks
test:
	cargo test
	@if command -v node >/dev/null 2>&1; then node scripts/check-frontend.mjs; fi

docs:
	.venv/bin/python -m sphinx -b html docs docs/_build/html

docs-clean:
	rm -rf docs/_build

bench:
	cargo bench

# Build frontend for production (requires Node)
frontend-prod:
	node scripts/build-frontend.mjs --prod

# Docker
docker:
	docker build -t edatime .

docker-run:
	docker run --rm -p 3000:3000 edatime

clean:
	cargo clean
