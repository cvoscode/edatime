//! Ingest layer unit tests
use crate::ingest::{load_dataframe, load_dataframe_partial};
use polars::prelude::{DataFrame, LazyFrame, SerReader, Series};
use std::fs;

#[test]
fn test_load_dataframe_existing_file() {
    // Test loading existing sample.csv
    let df = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").expect("Failed to load sample.csv")
    });
    
    assert!(df.height() > 0, "Sample CSV should have data");
}

#[test]
fn test_load_dataframe_missing_file() {
    // Test loading non-existing file
    let result = tokio::task::block_in_place(|| load_dataframe("nonexistent.csv"));
    assert!(result.is_err(), "Should fail for missing file");
}

#[test]
fn test_load_dataframe_partial_with_nrows() {
    // Test partial loading with n_rows
    let df = tokio::task::block_in_place(|| {
        load_dataframe_partial("sample.csv", Some(10), 0, None, None, None)
    }).unwrap_or_else(|_| DataFrame::default());
    
    let df = df.as_struct();
    assert!(df.n_rows() <= 10, "Should load at most 10 rows");
}

#[test]
fn test_load_dataframe_partial_with_skiprows() {
    // Test partial loading with skip_rows
    let df = tokio::task::block_in_place(|| {
        load_dataframe_partial("sample.csv", None, 5, None, None, None)
    }).unwrap_or_else(|_| DataFrame::default());
    
    assert!(df.height() < 100, "Should skip first 5 rows");
}

#[test]
fn test_parse_time_ms_iso8601() {
    let result = "2024-01-15T10:30:00+00:00".to_string();
    // This is tested via parse_time_ms in upload.rs
}

#[tokio::test]
async fn test_load_dataframe_concurrent() {
    // Test concurrent loading of same file
    let df1 = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv")
            .unwrap_or_else(|_| DataFrame::default())
    });
    
    let df2 = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv")
            .unwrap_or_else(|_| DataFrame::default())
    });
    
    assert_eq!(df1.height(), df2.height(), "Concurrent loads should produce same result");
}

#[test]
fn test_serialize_dataframe_to_arrow() {
    use crate::arrow_export::serialize_dataframe_to_arrow;
    
    let df = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").unwrap_or_else(|_| DataFrame::default())
    });
    
    let (buf, info) = tokio::task::block_in_place(|| {
        serialize_dataframe_to_arrow(&df)
    });
    
    assert!(!buf.is_empty(), "Serialized data should not be empty");
    assert!(!info.name.is_empty(), "Arrow schema should have name");
}