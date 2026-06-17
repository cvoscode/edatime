/**
 * Client-side clustering of correlation matrix columns.
 *
 * Reorders columns so highly correlated metrics sit next to each other.
 * Uses agglomerative average-linkage over `1 - |r|` distance, then cuts
 * the resulting hierarchy at the requested threshold to report clusters.
 *
 * The function is pure and deterministic: ties are broken by input order,
 * then by cluster id.
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
    height: number;
    left: InternalCluster | null;
    right: InternalCluster | null;
}

function distanceFromCorrelation(value: number | null | undefined): number {
    if (value === null || value === undefined) return 1;
    if (!Number.isFinite(value)) return 1;
    return 1 - Math.min(1, Math.abs(value));
}

function averageLinkageDistance(
    a: InternalCluster,
    b: InternalCluster,
    originalIndex: Map<string, number>,
    matrix: (number | null)[][],
): number {
    let sum = 0;
    let count = 0;
    for (const ma of a.members) {
        const ia = originalIndex.get(ma);
        if (ia === undefined) continue;
        for (const mb of b.members) {
            const ib = originalIndex.get(mb);
            if (ib === undefined) continue;
            const d = distanceFromCorrelation(matrix[ia]?.[ib]);
            sum += d;
            count += 1;
        }
    }
    return count > 0 ? sum / count : 1;
}

function firstOriginalIndex(cluster: InternalCluster, originalIndex: Map<string, number>): number {
    let first = Number.POSITIVE_INFINITY;
    for (const member of cluster.members) {
        const index = originalIndex.get(member);
        if (index !== undefined && index < first) first = index;
    }
    return first;
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

    const initialClusters: InternalCluster[] = columns.map((name, i) => ({
        id: i,
        members: [name],
        height: 0,
        left: null,
        right: null,
    }));
    let active: InternalCluster[] = [...initialClusters];
    let nextClusterId = n;

    function sortActive(): void {
        active.sort((a, b) => {
            const aFirst = firstOriginalIndex(a, originalIndex);
            const bFirst = firstOriginalIndex(b, originalIndex);
            if (aFirst !== bFirst) return aFirst - bFirst;
            return a.id - b.id;
        });
    }

    function findBestPair(): { aIndex: number; bIndex: number; dist: number } | null {
        sortActive();
        let best: { aIndex: number; bIndex: number; dist: number } | null = null;
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const a = active[i]!;
                const b = active[j]!;
                const dist = averageLinkageDistance(a, b, originalIndex, matrix);
                if (best === null || dist < best.dist) {
                    best = { aIndex: i, bIndex: j, dist };
                }
            }
        }
        return best;
    }

    while (active.length > 1) {
        const best = findBestPair();
        if (!best) break;
        const a = active[best.aIndex]!;
        const b = active[best.bIndex]!;

        const merged: InternalCluster = {
            id: nextClusterId++,
            members: [...a.members, ...b.members],
            height: best.dist,
            left: a,
            right: b,
        };
        active = active.filter((_, index) => index !== best.aIndex && index !== best.bIndex);
        active.push(merged);
    }

    const root = active[0]!;
    const order = [...root.members];

    function cutClusters(node: InternalCluster): InternalCluster[] {
        if (!node.left || !node.right) return [node];
        if (node.height < stopDistance) return [node];
        return [...cutClusters(node.left), ...cutClusters(node.right)];
    }

    const cut = cutClusters(root);
    const clusterByMember = new Map<string, InternalCluster>();
    for (const cluster of cut) {
        for (const member of cluster.members) {
            clusterByMember.set(member, cluster);
        }
    }

    const finalClusters: Cluster[] = [];
    const assignment = new Map<string, number>();
    const emitted = new Set<number>();

    for (let i = 0; i < order.length; i++) {
        const name = order[i]!;
        const c = clusterByMember.get(name);
        if (!c || emitted.has(c.id)) continue;
        emitted.add(c.id);
        const start = i;
        const members = [...c.members];
        for (const member of members) assignment.set(member, finalClusters.length);
        finalClusters.push({
            id: finalClusters.length,
            members,
            startIndex: start,
            endIndex: start + members.length,
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
