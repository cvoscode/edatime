/**
 * Client-side clustering of correlation matrix columns.
 *
 * Reorders columns so highly correlated metrics sit next to each other.
 * Uses agglomerative single-linkage over `1 - |r|` distance and stops
 * merging when no remaining pair has `|r| >= threshold`.
 *
 * The function is pure and deterministic: ties are broken by the
 * lexicographic order of column names, then by cluster id.
 */

export interface Cluster {
    /** Stable cluster id, assigned in render order. */
    id: number;
    /** Member column names, in the order they appear in the final `order` array. */
    members: string[];
    /** Start index (inclusive) in the final `order` array. */
    startIndex: number;
    /** End index (exclusive) in the final `order` array. */
    endIndex: number;
}

export interface ClusterResult {
    /** Column names in the new render order. */
    order: string[];
    /** Clusters sorted by `startIndex`. */
    clusters: Cluster[];
    /** Map from column name to cluster id. */
    assignment: Map<string, number>;
    /** True when the returned order matches the input order (e.g. all singletons). */
    identity: boolean;
}

interface InternalCluster {
    id: number;
    members: string[];
    active: boolean;
}

function distanceFromCorrelation(value: number | null | undefined): number {
    if (value === null || value === undefined) return 1;
    if (!Number.isFinite(value)) return 1;
    return 1 - Math.min(1, Math.abs(value));
}

function singleLinkageDistance(
    a: InternalCluster,
    b: InternalCluster,
    originalIndex: Map<string, number>,
    matrix: (number | null)[][],
): number {
    let best = 1;
    for (const ma of a.members) {
        const ia = originalIndex.get(ma);
        if (ia === undefined) continue;
        for (const mb of b.members) {
            const ib = originalIndex.get(mb);
            if (ib === undefined) continue;
            const d = distanceFromCorrelation(matrix[ia]?.[ib]);
            if (d < best) best = d;
        }
    }
    return best;
}

export function clusterColumns(
    columns: string[],
    matrix: (number | null)[][],
    threshold: number,
): ClusterResult {
    const n = columns.length;

    const buildIdentity = (order: string[]): ClusterResult => ({
        order,
        clusters: order.map((name, i) => ({
            id: i,
            members: [name],
            startIndex: i,
            endIndex: i + 1,
        })),
        assignment: new Map(order.map((name, i) => [name, i])),
        identity: true,
    });

    if (n === 0) {
        return { order: [], clusters: [], assignment: new Map(), identity: true };
    }

    const originalIndex = new Map<string, number>();
    columns.forEach((name, i) => originalIndex.set(name, i));

    if (n === 1) return buildIdentity([...columns]);

    const clampedThreshold = Math.max(0, Math.min(1, threshold));
    const stopDistance = 1 - clampedThreshold;

    const clusters: InternalCluster[] = columns.map((name, i) => ({
        id: i,
        members: [name],
        active: true,
    }));
    let nextClusterId = n;

    function activeIds(): number[] {
        const ids: number[] = [];
        for (const c of clusters) {
            if (c.active) ids.push(c.id);
        }
        // Sort by first member name (lex), then by cluster id, for stable
        // tie-breaking in the search loop below.
        ids.sort((aId, bId) => {
            const a = clusters[aId]!;
            const b = clusters[bId]!;
            const aName = a.members[0]!;
            const bName = b.members[0]!;
            if (aName < bName) return -1;
            if (aName > bName) return 1;
            return aId - bId;
        });
        return ids;
    }

    function findBestPair(): { aId: number; bId: number; dist: number } | null {
        const ids = activeIds();
        let best: { aId: number; bId: number; dist: number } | null = null;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const aId = ids[i]!;
                const bId = ids[j]!;
                const a = clusters[aId]!;
                const b = clusters[bId]!;
                const dist = singleLinkageDistance(a, b, originalIndex, matrix);
                if (best === null || dist < best.dist) {
                    best = { aId, bId, dist };
                }
            }
        }
        return best;
    }

    while (true) {
        const best = findBestPair();
        if (!best) break;
        if (best.dist >= stopDistance) break;

        const a = clusters[best.aId]!;
        const b = clusters[best.bId]!;

        a.active = false;
        b.active = false;

        const mergedMembers = [...a.members, ...b.members].sort((x, y) => {
            if (x < y) return -1;
            if (x > y) return 1;
            return 0;
        });
        const merged: InternalCluster = {
            id: nextClusterId++,
            members: mergedMembers,
            active: true,
        };
        clusters[merged.id] = merged;
    }

    // Build the final order. Walk active clusters in the order their
    // first member appears in the original column list. Within a cluster,
    // members are sorted lexicographically (above).
    const firstSeen = new Map<number, number>();
    for (let i = 0; i < n; i++) {
        const name = columns[i]!;
        for (const c of clusters) {
            if (!c.active) continue;
            if (c.members.includes(name)) {
                if (!firstSeen.has(c.id)) {
                    firstSeen.set(c.id, firstSeen.size);
                }
                break;
            }
        }
    }

    const orderedActiveIds = [...firstSeen.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id);

    const order: string[] = [];
    const finalClusters: Cluster[] = [];
    const assignment = new Map<string, number>();

    for (const id of orderedActiveIds) {
        const c = clusters[id]!;
        const start = order.length;
        for (const m of c.members) {
            order.push(m);
            assignment.set(m, finalClusters.length);
        }
        finalClusters.push({
            id: finalClusters.length,
            members: [...c.members],
            startIndex: start,
            endIndex: order.length,
        });
    }

    const isIdentity =
        order.length === columns.length &&
        order.every((name, i) => name === columns[i]);

    return {
        order,
        clusters: finalClusters,
        assignment,
        identity: isIdentity,
    };
}
