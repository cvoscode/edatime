# crates/edatime-query/src/derived.rs
> Portable expression grammar for cleaning-plan `DerivedColumn` stages. Mirrors the legacy Transform dialog and produces both Polars and codegen expressions.

## Constant
- `const ALLOWED_FUNCTIONS: &[&str]` — `abs, log, log2, log10, sqrt, exp, sin, cos, tan, ceil, floor, round`.

## Enum
- `pub enum DerivedExpression`:
  - `Column(String)`
  - `Literal(f64)`
  - `Binary { operator: char, left: Box<Self>, right: Box<Self> }` — Operators: `+ - * / %`.
  - `Function { name: String, input: Box<Self> }`

## Functions
- `pub fn parse_derived_expression(raw: &str) -> Result<DerivedExpression, AppError>` — Trims, rejects empty / > 500 chars, parses unary functions first, then binary operators right-to-left (skipping `-` after `+-*/%(`), then numeric literal (must be finite), then bare column name.
- `pub fn validate_derived_expression_columns(expression: &DerivedExpression, schema: &Schema) -> Result<(), AppError>` — Confirms every referenced column exists in the schema.

## Methods on `DerivedExpression`
- `pub fn columns(&self) -> Vec<String>` — Sorted, deduplicated referenced columns.
- `pub fn to_polars_expr(&self) -> Expr` — Returns a `polars::prelude::Expr` (functions are wrapped in a `cast(Float64).map(...)` chunked closure returning `Float64Chunked`).
- `pub fn to_python_polars(&self) -> String` — Renders Python `polars` source: `pl.col("x")`, numeric literals, parenthesized binary, `(<expr>).cast(pl.Float64).log(base=math.e)` for `log`, `log(base=2)`, `log(base=10)`, or `.name()` for the rest.
- `pub fn to_rust_polars(&self) -> String` — Renders Rust `polars` source with `col("x")`, numeric literals, and a `cast(Float64).map(|series| ...)` chunked closure producing `Float64Chunked`.

## Module-private helpers
- `fn quote(value: &str) -> String` — JSON-quoted (so arbitrary column names are safely embedded in both Rust and Python source).
- `fn number(value: f64) -> String` — Special-cases `0.0`.
- `fn parse_expression(expression: &str) -> Result<DerivedExpression, AppError>`
- `fn float_function(expression: Expr, name: &str) -> Expr` — Polars expression builder that casts to `Float64` and maps to a `Float64Chunked`.
- `fn apply_function(name: &str, value: f64) -> f64` — Rust-side function dispatch.

## Notes
- Grammar is deliberately small (numeric literals, unquoted columns, `+ - * / %`, unary numeric functions). It does not support parenthesized grouping beyond the function-call form `name(...)`.
- The Python and Rust codegen paths share one parser tree; both are emitted by `routes/cleaning::generate_python_polars` / `generate_rust_polars`.
