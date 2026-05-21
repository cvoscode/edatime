//! Shared HTTP response types and helpers.
//! Used across multiple crates for consistent response header handling.

use std::collections::HashMap;

/// Metadata for edatime HTTP response headers.
#[derive(Debug, Clone)]
pub struct ResponseMeta {
    pub is_downsampled: bool,
    pub returned_rows: usize,
    pub target_points: Option<usize>,
}

/// Build a header map with standard edatime headers (`x-edatime-downsampled`, `x-edatime-returned-rows`,
/// `x-edatime-target-points`).
pub fn edatime_headers(meta: &ResponseMeta) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert(
        "x-edatime-downsampled".to_string(),
        if meta.is_downsampled { "1" } else { "0" }.to_string(),
    );
    headers.insert("x-edatime-returned-rows".to_string(), meta.returned_rows.to_string());
    if let Some(tp) = meta.target_points {
        headers.insert("x-edatime-target-points".to_string(), tp.to_string());
    }
    headers
}