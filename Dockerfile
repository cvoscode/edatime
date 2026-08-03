# ── Frontend build stage ───────────────────────────────────────
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/ frontend/
COPY scripts/ scripts/
RUN npm run build:prod

# ── Rust build stage ───────────────────────────────────────────
FROM rust:bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY crates/ crates/
COPY contracts/ contracts/

ARG EDATIME_BUILD_SHA=unknown
ENV EDATIME_BUILD_SHA=${EDATIME_BUILD_SHA}
ENV EDATIME_BUILD_PROFILE=release
RUN cargo build --release -p edatime-bin --bin edatime

# ── Runtime stage ─────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/edatime /usr/local/bin/edatime
COPY --from=frontend-builder /build/crates/edatime-bin/frontend/dist/ /app/frontend/

RUN useradd -r -s /bin/false edatime

WORKDIR /app
ENV EDATIME_HOST=0.0.0.0
ENV EDATIME_ALLOW_INSECURE_PUBLIC=true
ENV EDATIME_PORT=3000
ENV EDATIME_FRONTEND_DIR=/app/frontend
EXPOSE 3000

USER edatime
ENTRYPOINT ["edatime"]
