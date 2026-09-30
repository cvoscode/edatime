# ai/frontend/src/utils/correlationClustering.md
> Client-side clustering of correlation matrix columns. Reorders columns so highly correlated metrics sit next to each other using agglomerative single-linkage over `1 - |r|` distance. Pure and deterministic — ties are broken by lexicographic column name, then cluster id.

## Interfaces
```ts
interface Cluster {
    id: number;                        // stable id assigned in render order
    members: string[];                 // member column names in final order
    startIndex: number;                // start index (inclusive) in the final order array
    endIndex: number;                  // end index (exclusive) in the final order array
}

interface ClusterResult {
    order: string[];                   // column names in the new render order
    clusters: Cluster[];               // clusters sorted by startIndex
    assignment: Map<string, number>;   // column name -> cluster id
    identity: boolean;                 // true when the returned order matches the input order
}

interface InternalCluster {            // private to the module
    id: number;
    members: string[];
    active: boolean;
}
```

## Functions
- `clusterColumns(columns: string[], matrix: (number | null)[][], threshold: number): ClusterResult`
  - Pure single-linkage agglomerative clustering. Clamps `threshold` to `[0, 1]`. Stops merging when no remaining pair has `1 - |r| < 1 - threshold`. Returns `identity: true` for empty / single-column inputs and when no merge occurred.