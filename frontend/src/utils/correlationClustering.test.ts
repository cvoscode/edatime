/**
 * Tests for frontend/src/utils/correlationClustering.ts
 */
import { describe, it, expect } from 'vitest';
import { clusterColumns } from '../utils/correlationClustering';

function diagonalZero(n: number, fill: number): (number | null)[][] {
    const m: (number | null)[][] = [];
    for (let i = 0; i < n; i++) {
        const row: (number | null)[] = [];
        for (let j = 0; j < n; j++) {
            row.push(i === j ? 1 : fill);
        }
        m.push(row);
    }
    return m;
}

function allOnes(n: number): (number | null)[][] {
    const m: (number | null)[][] = [];
    for (let i = 0; i < n; i++) {
        const row: (number | null)[] = [];
        for (let j = 0; j < n; j++) {
            row.push(1);
        }
        m.push(row);
    }
    return m;
}

describe('clusterColumns', () => {
    it('returns identity ordering for a single column', () => {
        const result = clusterColumns(['a'], allOnes(1), 0.5);
        expect(result.order).toEqual(['a']);
        expect(result.clusters).toHaveLength(1);
        expect(result.clusters[0]?.members).toEqual(['a']);
        expect(result.assignment.get('a')).toBe(0);
    });

    it('returns an empty result for an empty input', () => {
        const result = clusterColumns([], [], 0.5);
        expect(result.order).toEqual([]);
        expect(result.clusters).toEqual([]);
        expect(result.assignment.size).toBe(0);
    });

    it('keeps every column as its own cluster when all correlations are below threshold', () => {
        const result = clusterColumns(['a', 'b', 'c'], diagonalZero(3, 0.1), 0.5);
        expect(result.order).toEqual(['a', 'b', 'c']);
        expect(result.clusters).toHaveLength(3);
        expect(result.clusters.map((c) => c.members)).toEqual([['a'], ['b'], ['c']]);
    });

    it('groups all columns into a single cluster when all correlations are above threshold', () => {
        const result = clusterColumns(['a', 'b', 'c'], allOnes(3), 0.5);
        expect(result.clusters).toHaveLength(1);
        expect(result.clusters[0]?.members.sort()).toEqual(['a', 'b', 'c']);
        expect(result.order.sort()).toEqual(['a', 'b', 'c']);
    });

    it('produces two clusters for a 2-block matrix with low cross-block correlation', () => {
        // Block A: columns 0,1,2 — within-block r=0.95
        // Block B: columns 3,4,5 — within-block r=0.95
        // Cross-block r=0.0
        const cols = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
        const matrix: (number | null)[][] = [
            [1, 0.95, 0.95, 0, 0, 0],
            [0.95, 1, 0.95, 0, 0, 0],
            [0.95, 0.95, 1, 0, 0, 0],
            [0, 0, 0, 1, 0.95, 0.95],
            [0, 0, 0, 0.95, 1, 0.95],
            [0, 0, 0, 0.95, 0.95, 1],
        ];
        const result = clusterColumns(cols, matrix, 0.9);
        expect(result.clusters).toHaveLength(2);
        const sizes = result.clusters.map((c) => c.members.length).sort();
        expect(sizes).toEqual([3, 3]);
        // Each cluster contains one of the blocks.
        const clusterA = result.clusters.find((c) => c.members.includes('a1'));
        const clusterB = result.clusters.find((c) => c.members.includes('b1'));
        expect(clusterA?.members.sort()).toEqual(['a1', 'a2', 'a3']);
        expect(clusterB?.members.sort()).toEqual(['b1', 'b2', 'b3']);
    });

    it('does not absorb a weakly related column through a single strong bridge', () => {
        const cols = ['a', 'b', 'c'];
        const matrix: (number | null)[][] = [
            [1, 0.9, 0.1],
            [0.9, 1, 0.9],
            [0.1, 0.9, 1],
        ];

        const result = clusterColumns(cols, matrix, 0.85);

        expect(result.clusters).toHaveLength(2);
        expect(result.clusters.map((c) => c.members)).toEqual([['a', 'b'], ['c']]);
    });

    it('treats null cells as the maximum distance (no clustering across nulls)', () => {
        const matrix: (number | null)[][] = [
            [1, 0.99, null],
            [0.99, 1, null],
            [null, null, 1],
        ];
        const result = clusterColumns(['a', 'b', 'c'], matrix, 0.9);
        // a and b cluster, c stays alone.
        const sizes = result.clusters.map((c) => c.members.length).sort();
        expect(sizes).toEqual([1, 2]);
        const pairCluster = result.clusters.find((c) => c.members.length === 2);
        expect(pairCluster?.members.sort()).toEqual(['a', 'b']);
    });

    it('does not merge clusters when threshold is 1.0', () => {
        const result = clusterColumns(['a', 'b', 'c'], allOnes(3), 1.0);
        // stopDistance = 0, all distances must be < 0 to merge → no merges.
        expect(result.clusters).toHaveLength(3);
    });

    it('merges everything when threshold is 0', () => {
        const result = clusterColumns(['a', 'b', 'c', 'd'], diagonalZero(4, -1), 0);
        // stopDistance = 1, all distances are 1 - |r|; with r=-1, dist=0 < 1 → merge.
        expect(result.clusters).toHaveLength(1);
    });

    it('reports the original index positions via the assignment map', () => {
        const cols = ['a', 'b', 'c'];
        const result = clusterColumns(cols, allOnes(3), 0.5);
        expect(result.assignment.get('a')).toBeDefined();
        expect(result.assignment.get('b')).toBeDefined();
        expect(result.assignment.get('c')).toBeDefined();
        // All three share a single cluster id.
        const ids = new Set([result.assignment.get('a'), result.assignment.get('b'), result.assignment.get('c')]);
        expect(ids.size).toBe(1);
    });

    it('startIndex and endIndex cover the full order without gaps', () => {
        const cols = ['a1', 'a2', 'b1', 'b2'];
        const matrix: (number | null)[][] = [
            [1, 0.95, 0, 0],
            [0.95, 1, 0, 0],
            [0, 0, 1, 0.95],
            [0, 0, 0.95, 1],
        ];
        const result = clusterColumns(cols, matrix, 0.9);
        expect(result.clusters).toHaveLength(2);
        expect(result.clusters[0]?.startIndex).toBe(0);
        expect(result.clusters[0]?.endIndex).toBe(2);
        expect(result.clusters[1]?.startIndex).toBe(2);
        expect(result.clusters[1]?.endIndex).toBe(4);
        expect(result.order).toHaveLength(4);
    });

    it('flag is true when no reordering happened', () => {
        const result = clusterColumns(['a', 'b', 'c'], diagonalZero(3, 0.1), 0.5);
        expect(result.identity).toBe(true);
    });
});
