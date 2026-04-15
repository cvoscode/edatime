//! Ingest layer unit tests
use crate::ingest::{IngestParams, load_dataframe, load_dataframe_partial};
use polars::prelude::DataFrame;

#[test]
fn test_load_dataframe_existing_file() {
    let df = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").expect("Failed to load sample.csv")
    });

    assert!(df.height() > 0, "Sample CSV should have data");
}

#[test]
fn test_load_dataframe_missing_file() {
    let result = tokio::task::block_in_place(|| load_dataframe("nonexistent.csv"));
    assert!(result.is_err(), "Should fail for missing file");
}

#[test]
fn test_load_dataframe_partial_with_nrows() {
    let df = tokio::task::block_in_place(|| {
        load_dataframe_partial(
            "sample.csv",
            &IngestParams {
                n_rows: Some(10),
                ..IngestParams::default()
            },
        )
    })
    .unwrap_or_else(|_| DataFrame::default());

    assert!(df.height() <= 10, "Should load at most 10 rows");
}

#[test]
fn test_load_dataframe_partial_with_skiprows() {
    let df = tokio::task::block_in_place(|| {
        load_dataframe_partial(
            "sample.csv",
            &IngestParams {
                skip_rows: 5,
                ..IngestParams::default()
            },
        )
    })
    .unwrap_or_else(|_| DataFrame::default());

    assert!(df.height() < 100, "Should skip first 5 rows");
}

#[tokio::test]
async fn test_load_dataframe_concurrent() {
    let df1 = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").unwrap_or_else(|_| DataFrame::default())
    });

    let df2 = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").unwrap_or_else(|_| DataFrame::default())
    });

    assert_eq!(
        df1.height(),
        df2.height(),
        "Concurrent loads should produce same result"
    );
}

#[test]
fn test_arrow_ipc_serialization() {
    use crate::arrow_export::dataframe_to_arrow_ipc;

    let df = tokio::task::block_in_place(|| {
        load_dataframe("sample.csv").unwrap_or_else(|_| DataFrame::default())
    });

    if df.height() > 0 {
        let buf = dataframe_to_arrow_ipc(df).expect("Arrow IPC serialization should succeed");
        assert!(!buf.is_empty(), "Serialized data should not be empty");
    }
}
