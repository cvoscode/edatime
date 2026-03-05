use polars::prelude::*;

pub fn dataframe_to_arrow_ipc(mut df: DataFrame) -> PolarsResult<Vec<u8>> {
    let mut buf = Vec::new();

    IpcStreamWriter::new(&mut buf)
        .finish(&mut df)?;
    
    Ok(buf)
}
