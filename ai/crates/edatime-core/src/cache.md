# crates/edatime-core/src/cache.rs
> Simple in-memory cache with revision-based invalidation.

## Struct

### `ResponseCache`
- `store: Arc<Mutex<HashMap<String, Vec<u8>>>>`
- `revision: Arc<AtomicU64>`

## Methods
- `new() -> Self`
- `get(&self, key: &str) -> Option<Vec<u8>>`
  - Retrieve a cached entry by key.
- `insert(&self, key: String, value: Vec<u8>)`
  - Insert a key/value pair into the cache.
- `clear_for_revision(&self)`
  - Clear all entries and bump the revision counter.
- `revision(&self) -> u64`
  - Return the current cache revision.