import { clusterColumns, type Cluster } from '../../utils/correlationClustering.js';

export interface HeatmapRenderOrder {
    order: string[];
    clusters: Cluster[];
    originalIndices: Map<number, number>;
}

export function buildHeatmapRenderOrder(options: {
    columns: string[];
    matrix: (number | null)[][];
    savedOrder: string[] | null;
    clusterEnabled: boolean;
    clusterThreshold: number;
}): HeatmapRenderOrder {
    const { columns, matrix, savedOrder, clusterEnabled, clusterThreshold } = options;
    const manualOrderValid = savedOrder !== null
        && savedOrder.length === columns.length
        && savedOrder.every((name) => columns.includes(name));
    let order = columns;
    let clusters: Cluster[] = [];
    if (manualOrderValid && savedOrder) {
        order = savedOrder.slice();
    } else if (clusterEnabled && columns.length > 1) {
        const result = clusterColumns(columns, matrix, clusterThreshold);
        order = result.order;
        clusters = result.clusters;
    }
    return {
        order,
        clusters,
        originalIndices: new Map(order.map((name, index) => [index, columns.indexOf(name)])),
    };
}
