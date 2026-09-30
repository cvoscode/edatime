# Original Timestamp Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove timestamp-column normalization so backend responses preserve the source time column name while the frontend still produces its internal `ts` arrays.

**Architecture:** Keep the internal frontend chart model unchanged (`DataObject.ts`) but derive it from the dataset's real time column instead of a hardcoded Arrow field. On the backend, stop aliasing Arrow and JSON payloads to `ts` and expose the original timestamp column name in the serialized output.

**Tech Stack:** Rust, Polars, TypeScript, Vitest

---

### Task 1: Add failing coverage for passthrough timestamp names

**Files:**
- Modify: `frontend/src/dataClient.test.ts`
- Modify: `crates/edatime-query/src/pipeline.rs`

- [ ] **Step 1: Write the failing frontend test**

```ts
it('reads the original timestamp column from Arrow schema', async () => {
    const { fetchData } = await import('./dataClient');
    // mock Arrow schema exposes "event_time" instead of "ts"
    // expect fetchData(...).ts to still be populated
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dataClient.test.ts`
Expected: FAIL with `No timestamp column found`

- [ ] **Step 3: Write the failing backend test**

```rust
#[test]
fn serialize_json_preserves_original_timestamp_key() {
    // build DataFrame with "event_time"
    // serialize_json(...)
    // assert payload has "event_time" and not "ts"
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cargo test -p edatime-query serialize_json_preserves_original_timestamp_key`
Expected: FAIL because payload currently uses `ts`

### Task 2: Implement passthrough timestamp handling

**Files:**
- Modify: `frontend/src/dataClient.ts`
- Modify: `frontend/src/__mocks__/apache-arrow.ts`
- Modify: `crates/edatime-query/src/pipeline.rs`

- [ ] **Step 1: Update frontend timestamp resolution**

```ts
function resolveTimestampColumn(table: ArrowTable, requestedCols: string[]): string { /* ... */ }
```

- [ ] **Step 2: Remove backend timestamp aliasing**

```rust
// serialize_arrow keeps ts_col as-is
// serialize_json inserts payload.insert(ts_col.to_string(), ...)
```

- [ ] **Step 3: Update test mocks**

```ts
schema: { fields: [{ name: 'event_time', type: 'Int64' }, ...] }
```

### Task 3: Verify the contract end-to-end

**Files:**
- Modify: `frontend/src/dataClient.test.ts`
- Modify: `crates/edatime-query/src/pipeline.rs`

- [ ] **Step 1: Run focused frontend test**

Run: `npm test -- dataClient.test.ts`
Expected: PASS

- [ ] **Step 2: Run focused Rust test**

Run: `cargo test -p edatime-query serialize_json_preserves_original_timestamp_key`
Expected: PASS

- [ ] **Step 3: Run build verification**

Run: `cargo test -p edatime-query`
Expected: PASS
