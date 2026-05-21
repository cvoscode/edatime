use polars::prelude::*;
use std::io::Cursor;

pub fn dataframe_to_arrow_ipc(mut df: DataFrame) -> PolarsResult<Vec<u8>> {
    let mut buf = Vec::new();

    IpcStreamWriter::new(&mut buf).finish(&mut df)?;

    Ok(buf)
}

pub fn dataframe_to_parquet(mut df: DataFrame) -> PolarsResult<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    ParquetWriter::new(&mut cursor).finish(&mut df)?;
    Ok(cursor.into_inner())
}
