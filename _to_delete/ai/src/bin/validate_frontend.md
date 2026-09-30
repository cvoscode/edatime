# validate_frontend.rs

**Purpose:** Rust-based frontend JavaScript syntax validator that replaces the Node.js `check-frontend.mjs` script to enable pure Rust distribution without npm dependency.

## Functions

```rust
fn collect_js_files(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()>
```

```rust
fn validate_file(path: &Path) -> Result<(), String>
```

```rust
fn main()
```
