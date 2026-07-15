import { describe, expect, it } from 'vitest';

import { buildPipelineGraph, renderPipelineGraphSvg, serializePipelineGraph } from './pipelineGraph.js';
import type { CleaningPlan } from './types.js';

function plan(): CleaningPlan {
    return {
        schemaVersion: 1,
        id: 'plan-1',
        planRevision: 4,
        sourceVersionId: 'source-7',
        datasetRevision: 7,
        datasetFingerprint: 'dataset-fingerprint',
        schemaFingerprint: 'schema-fingerprint',
        timeColumn: 'ts',
        sourceName: 'Source <data>',
        createdAt: '2026-07-15T00:00:00Z',
        updatedAt: '2026-07-15T00:00:00Z',
        stages: [
            {
                id: 'time', kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                sourcePage: 'timeseries', label: 'Keep window', createdAt: 'now', updatedAt: 'now',
                startMs: 10, endMs: 20, mode: 'keepInside',
            },
            {
                id: 'note', kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true,
                sourcePage: 'manual', label: 'Review <before export>', note: 'Escaped & preserved', createdAt: 'now', updatedAt: 'now', severity: 'warning',
            },
            {
                id: 'range', kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: false,
                sourcePage: 'timeseries', label: 'Drop invalid values', createdAt: 'now', updatedAt: 'now',
                column: 'value', from: 1, to: 9, mode: 'dropInside',
            },
        ],
    };
}

describe('pipeline graph', () => {
    it('preserves executable stage order while keeping annotations off the data path', () => {
        const graph = buildPipelineGraph(plan());

        expect(graph.nodes.map((node) => node.id)).toEqual([
            'source',
            'timeRange:time',
            'annotation:note',
            'columnRange:range',
            'working-dataset',
        ]);
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ from: 'source', to: 'timeRange:time', kind: 'flow' }),
            expect.objectContaining({ from: 'timeRange:time', to: 'columnRange:range', kind: 'bypassed' }),
            expect.objectContaining({ from: 'timeRange:time', to: 'annotation:note', kind: 'annotation' }),
            expect.objectContaining({ from: 'columnRange:range', to: 'working-dataset', kind: 'flow' }),
        ]));
        expect(graph.nodes.find((node) => node.stageId === 'range')).toMatchObject({ status: 'disabled' });
        expect(graph.nodes.find((node) => node.stageId === 'note')).toMatchObject({ kind: 'annotation', status: 'metadata' });
    });

    it('serializes a deterministic graph audit record', () => {
        const graph = buildPipelineGraph(plan());

        expect(serializePipelineGraph(graph)).toBe(`${JSON.stringify(graph, null, 2)}\n`);
        expect(JSON.parse(serializePipelineGraph(graph))).toMatchObject({
            schemaVersion: 1,
            sourceVersionId: 'source-7',
            datasetRevision: 7,
            timeColumn: 'ts',
        });
    });

    it('renders escaped SVG with a selected stage marker', () => {
        const svg = renderPipelineGraphSvg(buildPipelineGraph(plan()), { selectedStageId: 'range' });

        expect(svg).toContain('Source &lt;data&gt;');
        expect(svg).toContain('Review &lt;before export&gt;');
        expect(svg).toContain('Escaped &amp; preserved');
        expect(svg).not.toContain('Source <data>');
        expect(svg).toContain('pipeline-graph__node--disabled is-selected');
        expect(svg).toContain('pipeline-graph__edge--bypassed');
    });

    it('represents an empty plan as source directly flowing to the working dataset', () => {
        const graph = buildPipelineGraph({ ...plan(), stages: [] });

        expect(graph.nodes.map((node) => node.id)).toEqual(['source', 'working-dataset']);
        expect(graph.edges).toEqual([expect.objectContaining({ from: 'source', to: 'working-dataset', kind: 'flow' })]);
    });
});
