import type { CleaningPlan, CleaningStage } from './types.js';

export const PIPELINE_GRAPH_SCHEMA_VERSION = 1 as const;

export type PipelineGraphNodeKind = 'source' | 'stage' | 'annotation' | 'result';
export type PipelineGraphNodeStatus = 'active' | 'disabled' | 'metadata' | 'result';
export type PipelineGraphEdgeKind = 'flow' | 'bypassed' | 'annotation';

export interface PipelineGraphNode {
    id: string;
    kind: PipelineGraphNodeKind;
    status: PipelineGraphNodeStatus;
    label: string;
    detail: string;
    stageId?: string;
    order: number;
}

export interface PipelineGraphEdge {
    id: string;
    from: string;
    to: string;
    kind: PipelineGraphEdgeKind;
    label?: string;
}

/**
 * A serializable visual projection of the canonical cleaning plan. The graph
 * deliberately has no independent mutation API: callers edit the plan store,
 * then derive a new graph snapshot.
 */
export interface PipelineGraph {
    schemaVersion: typeof PIPELINE_GRAPH_SCHEMA_VERSION;
    sourceVersionId: string;
    datasetRevision: number;
    datasetFingerprint: string | null;
    schemaFingerprint: string;
    timeColumn: string;
    planRevision: number;
    nodes: PipelineGraphNode[];
    edges: PipelineGraphEdge[];
}

export interface PipelineGraphSvgOptions {
    selectedStageId?: string | null;
    title?: string;
}

const SOURCE_NODE_ID = 'source';
const RESULT_NODE_ID = 'working-dataset';

function stageNodeId(stage: CleaningStage): string {
    return `${stage.kind}:${stage.id}`;
}

function annotationNodeId(stage: CleaningStage): string {
    return `annotation:${stage.id}`;
}

function stageDetail(stage: CleaningStage): string {
    switch (stage.kind) {
        case 'timeRange':
            return `${stage.mode === 'keepInside' ? 'Keep' : 'Drop'} ${formatTimestamp(stage.startMs)} – ${formatTimestamp(stage.endMs)}`;
        case 'columnRange':
            return `${stage.mode === 'keepInside' ? 'Keep' : 'Drop'} ${stage.column}: ${formatNumber(stage.from)} – ${formatNumber(stage.to)}`;
        case 'adaptiveLine':
            return `${stage.keepAbove ? 'Keep above' : 'Keep below'} adaptive line for ${stage.column}`;
        case 'annotation':
            return stage.note?.trim() || 'Informational annotation';
    }
}

function formatTimestamp(value: number): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatNumber(value: number): string {
    return Number.isFinite(value) ? String(value) : 'invalid';
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function shorten(value: string, limit = 28): string {
    return value.length > limit ? `${value.slice(0, Math.max(1, limit - 1))}…` : value;
}

/** Builds a stable graph whose main path preserves saved executable-stage order. */
export function buildPipelineGraph(plan: CleaningPlan): PipelineGraph {
    const nodes: PipelineGraphNode[] = [{
        id: SOURCE_NODE_ID,
        kind: 'source',
        status: 'active',
        label: plan.sourceName?.trim() || 'Source dataset',
        detail: `${plan.sourceVersionId} · revision ${plan.datasetRevision}`,
        order: -1,
    }];
    const edges: PipelineGraphEdge[] = [];
    let previousMainNodeId = SOURCE_NODE_ID;
    let executableOrder = 0;

    for (const stage of plan.stages) {
        if (stage.kind === 'annotation') {
            const id = annotationNodeId(stage);
            nodes.push({
                id,
                kind: 'annotation',
                status: 'metadata',
                label: stage.label || 'Annotation',
                detail: stageDetail(stage),
                stageId: stage.id,
                order: executableOrder,
            });
            edges.push({
                id: `annotation:${previousMainNodeId}:${id}`,
                from: previousMainNodeId,
                to: id,
                kind: 'annotation',
                label: 'documents',
            });
            continue;
        }

        const id = stageNodeId(stage);
        nodes.push({
            id,
            kind: 'stage',
            status: stage.enabled ? 'active' : 'disabled',
            label: stage.label || stage.kind,
            detail: stageDetail(stage),
            stageId: stage.id,
            order: executableOrder,
        });
        edges.push({
            id: `flow:${previousMainNodeId}:${id}`,
            from: previousMainNodeId,
            to: id,
            kind: stage.enabled ? 'flow' : 'bypassed',
            label: stage.enabled ? undefined : 'disabled',
        });
        previousMainNodeId = id;
        executableOrder += 1;
    }

    nodes.push({
        id: RESULT_NODE_ID,
        kind: 'result',
        status: 'result',
        label: 'Working dataset',
        detail: executableOrder === 0 ? 'Source without executable stages' : `${executableOrder} executable stage${executableOrder === 1 ? '' : 's'} in saved order`,
        order: executableOrder,
    });
    edges.push({
        id: `flow:${previousMainNodeId}:${RESULT_NODE_ID}`,
        from: previousMainNodeId,
        to: RESULT_NODE_ID,
        kind: 'flow',
    });

    return {
        schemaVersion: PIPELINE_GRAPH_SCHEMA_VERSION,
        sourceVersionId: plan.sourceVersionId,
        datasetRevision: plan.datasetRevision,
        datasetFingerprint: plan.datasetFingerprint,
        schemaFingerprint: plan.schemaFingerprint,
        timeColumn: plan.timeColumn,
        planRevision: plan.planRevision,
        nodes,
        edges,
    };
}

/** Deterministic audit export for the graph projection, independent of DOM state. */
export function serializePipelineGraph(graph: PipelineGraph): string {
    return `${JSON.stringify(graph, null, 2)}\n`;
}

/**
 * Renders a dependency-free SVG snapshot suitable for an audit attachment.
 * It is intentionally a simple semantic diagram rather than an interactive
 * chart library so opening the workbench does not add a large bundle.
 */
export function renderPipelineGraphSvg(graph: PipelineGraph, options: PipelineGraphSvgOptions = {}): string {
    const mainNodes = graph.nodes.filter((node) => node.kind !== 'annotation');
    const annotations = graph.nodes.filter((node) => node.kind === 'annotation');
    const nodeWidth = 176;
    const nodeHeight = 76;
    const gap = 54;
    const margin = 38;
    const width = Math.max(640, margin * 2 + mainNodes.length * nodeWidth + Math.max(0, mainNodes.length - 1) * gap);
    const annotationHeight = annotations.length ? 114 : 0;
    const height = 174 + annotationHeight;
    const positions = new Map<string, { x: number; y: number }>();
    mainNodes.forEach((node, index) => {
        positions.set(node.id, { x: margin + index * (nodeWidth + gap), y: 50 });
    });
    annotations.forEach((node, index) => {
        const parent = graph.edges.find((edge) => edge.to === node.id)?.from;
        const parentPosition = parent ? positions.get(parent) : undefined;
        positions.set(node.id, {
            x: Math.max(margin, (parentPosition?.x ?? margin) + index * 12),
            y: 158,
        });
    });

    const edgeSvg = graph.edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return '';
        if (edge.kind === 'annotation') {
            const x = from.x + nodeWidth / 2;
            return `<path class="pipeline-graph__edge pipeline-graph__edge--annotation" d="M ${x} ${from.y + nodeHeight} V ${to.y - 12} H ${to.x + nodeWidth / 2}" />`;
        }
        return `<path class="pipeline-graph__edge${edge.kind === 'bypassed' ? ' pipeline-graph__edge--bypassed' : ''}" d="M ${from.x + nodeWidth} ${from.y + nodeHeight / 2} H ${to.x - 8}" marker-end="url(#pipeline-arrow)" />`;
    }).join('');
    const nodeSvg = graph.nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position) return '';
        const selected = node.stageId && node.stageId === options.selectedStageId;
        const className = [
            'pipeline-graph__node',
            `pipeline-graph__node--${node.kind}`,
            `pipeline-graph__node--${node.status}`,
            selected ? 'is-selected' : '',
        ].filter(Boolean).join(' ');
        const label = escapeXml(shorten(node.label));
        const detail = escapeXml(shorten(node.detail, 42));
        return `<g class="${className}" data-node-id="${escapeXml(node.id)}"${node.stageId ? ` data-stage-id="${escapeXml(node.stageId)}"` : ''} tabindex="${node.stageId ? '0' : '-1'}" role="${node.stageId ? 'button' : 'img'}" aria-label="${escapeXml(`${node.label}: ${node.detail}`)}"><rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="10" /><text x="${position.x + 14}" y="${position.y + 30}" class="pipeline-graph__label">${label}</text><text x="${position.x + 14}" y="${position.y + 53}" class="pipeline-graph__detail">${detail}</text></g>`;
    }).join('');
    const title = escapeXml(options.title || `EdaTime pipeline for ${graph.sourceVersionId}`);

    return `<svg xmlns="http://www.w3.org/2000/svg" class="pipeline-graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="pipeline-graph-title pipeline-graph-description"><title id="pipeline-graph-title">${title}</title><desc id="pipeline-graph-description">Source dataset through ${mainNodes.length - 2} ordered transformation stage${mainNodes.length - 2 === 1 ? '' : 's'} to a working dataset.</desc><defs><marker id="pipeline-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>${edgeSvg}${nodeSvg}</svg>`;
}
