-- Deterministic postgres_1m fixture for the backend database ingestion benchmark.
-- Usage:
--   psql "$EDATIME_BENCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/postgres_benchmark_fixture.sql

DROP TABLE IF EXISTS edatime_benchmark_1m;
CREATE TABLE edatime_benchmark_1m (
    ts timestamptz PRIMARY KEY,
    v01 double precision, v02 double precision, v03 double precision,
    v04 double precision, v05 double precision, v06 double precision,
    v07 double precision, v08 double precision, v09 double precision,
    v10 double precision, v11 double precision, v12 double precision,
    v13 double precision, v14 double precision, v15 double precision,
    category text
);

INSERT INTO edatime_benchmark_1m
SELECT
    timestamptz '2020-01-01 00:00:00+00' + n * interval '1 second',
    sin(n * 0.001), cos(n * 0.001), sin(n * 0.002), cos(n * 0.002),
    sin(n * 0.003), cos(n * 0.003), sin(n * 0.004), cos(n * 0.004),
    sin(n * 0.005), cos(n * 0.005), sin(n * 0.006), cos(n * 0.006),
    sin(n * 0.007), cos(n * 0.007), sin(n * 0.008),
    'category-' || (n % 1000)::text
FROM generate_series(0, 999999) AS rows(n);

ANALYZE edatime_benchmark_1m;
