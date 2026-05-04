//! Rust-based frontend JavaScript syntax validator
//!
//! Replaces the Node.js `check-frontend.mjs` script to enable
//! pure Rust distribution without npm dependency.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Recursively collect all .js files under the given directory
fn collect_js_files(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            collect_js_files(&path, files)?;
        } else if path.extension().is_some_and(|ext| ext == "js") {
            files.push(path);
        }
    }

    Ok(())
}

/// Validate a single JavaScript file using `node --check`
fn validate_file(path: &Path) -> Result<(), String> {
    let output = Command::new("node")
        .arg("--check")
        .arg(path)
        .output()
        .map_err(|e| format!("Failed to spawn node: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.to_string())
    }
}

fn main() {
    let root = PathBuf::from("frontend/js");

    if !root.exists() || !root.is_dir() {
        eprintln!("Frontend source directory not found: {}", root.display());
        std::process::exit(1);
    }

    let mut files = Vec::new();
    collect_js_files(&root, &mut files).expect("Failed to read frontend directory");
    files.sort();

    let total = files.len();
    let validated = AtomicUsize::new(0);
    let mut failed = false;

    println!("Validating {} frontend modules...", total);

    for path in &files {
        match validate_file(path) {
            Ok(()) => {
                validated.fetch_add(1, Ordering::SeqCst);
            }
            Err(err) => {
                eprintln!("❌ {}: {}", path.display(), err);
                failed = true;
                break;
            }
        }
    }

    if failed {
        eprintln!("Validation failed!");
        std::process::exit(1);
    }

    println!(
        "✅ Validated {} frontend modules.",
        validated.load(Ordering::SeqCst)
    );
}
