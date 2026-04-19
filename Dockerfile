# ── Build stage ────────────────────────────────────────────────
FROM rust:1.86-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/
COPY benches/ benches/
COPY frontend/ frontend/

RUN cargo build --release --bin edatime

# ── Runtime stage ─────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/edatime /usr/local/bin/edatime
COPY --from=builder /build/frontend/ /app/frontend/

RUN useradd -r -s /bin/false edatime

WORKDIR /app
ENV EDATIME_HOST=0.0.0.0
ENV EDATIME_PORT=3000
ENV EDATIME_FRONTEND_DIR=/app/frontend
EXPOSE 3000

USER edatime
ENTRYPOINT ["edatime"]
