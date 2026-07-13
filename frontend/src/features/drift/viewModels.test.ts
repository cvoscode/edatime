import { describe, expect, it } from 'vitest';
import {
    buildColumnSummary,
    buildDetailStatRows,
    buildGlobalSummary,
    buildTimelineOption,
    buildWindowListHtml,
    filterResponseForEvaluation,
    statusSummary,
    timelineTooltipFormatter,
    type DriftResponse,
} from './viewModels.js';

function makeResponse(column: string, windows: DriftResponse['windows']): DriftResponse {
    return {
        column,
        reference: {
            start_ms: 0,
            end_ms: 100,
            label: 'Ref (1970-01-01 00:00 - 1970-01-01 00:01)',
            count: 10,
            null_count: 0,
            completeness: 1,
            mean: 1,
            std: 0.2,
            min: 0,
            max: 2,
            quantiles: [0.2, 0.7, 1.0, 1.3, 1.8],
            hist_bins: [0, 1, 2],
            hist_counts: [3, 7],
            ecdf_x: [0, 1, 2],
            ecdf_y: [0.2, 0.6, 1],
        },
        windows,
        thresholds: {
            ks_pvalue_threshold: 0.05,
            es_pvalue_threshold: 0.05,
            wasserstein_threshold: 0.2,
            psi_minor_threshold: 0.1,
            psi_major_threshold: 0.2,
        },
        metadata: {
            computation_time_ms: 12,
            num_windows: windows.length,
            reference_samples: 10,
            effective_bins: 20,
            avg_window_samples: 8,
            bin_count_warning: false,
            psi_sample_ratio_warning: false,
        },
    };
}

const response = makeResponse('value', [
    {
        start_ms: 1_735_691_400_000,
        end_ms: 1_735_695_000_000,
        label: '2025-01-01 00:30 - 01:30',
        count: 8,
        null_count: 0,
        completeness: 0.95,
        mean: 1.2,
        std: 0.2,
        min: 0.5,
        max: 2.1,
        quantiles: [0.5, 0.9, 1.2, 1.4, 1.9],
        hist_bins: [0, 1, 2],
        hist_counts: [2, 6],
        ecdf_x: [0.5, 1.2, 2.1],
        ecdf_y: [0.2, 0.7, 1],
        ks_stat: 0.1,
        ks_pvalue: 0.8,
        es_stat: 0.12,
        es_pvalue: 0.7,
        wasserstein: 0.2,
        psi: 0.12,
        jensen_shannon: 0.04,
        drift_level: 'yellow',
        trigger_reasons: ['psi_minor'],
        completeness_delta: -0.05,
        low_sample_warning: false,
    },
    {
        start_ms: 1_735_695_000_000,
        end_ms: 1_735_698_600_000,
        label: '2025-01-01 01:30 - 02:30',
        count: 9,
        null_count: 0,
        completeness: 0.82,
        mean: 1.6,
        std: 0.3,
        min: 0.8,
        max: 2.4,
        quantiles: [0.8, 1.2, 1.6, 1.9, 2.3],
        hist_bins: [0, 1, 2],
        hist_counts: [1, 8],
        ecdf_x: [0.8, 1.6, 2.4],
        ecdf_y: [0.2, 0.75, 1],
        ks_stat: 0.2,
        ks_pvalue: 0.03,
        es_stat: 0.19,
        es_pvalue: 0.02,
        wasserstein: 0.3,
        psi: 0.26,
        jensen_shannon: 0.12,
        drift_level: 'red',
        trigger_reasons: ['psi_major', 'ks', 'es', 'wasserstein'],
        completeness_delta: -0.18,
        low_sample_warning: false,
    },
]);

describe('drift view models', () => {
    it('filters windows for latest-n evaluation mode', () => {
        const filtered = filterResponseForEvaluation(response, 'latest-n', 1);
        expect(filtered.windows).toHaveLength(1);
        expect(filtered.windows[0]?.label).toBe('2025-01-01 01:30 - 02:30');
    });

    it('builds a per-column summary from the latest and worst windows', () => {
        const summary = buildColumnSummary(response);
        expect(summary.column).toBe('value');
        expect(summary.currentLevel).toBe('red');
        expect(summary.worstLevel).toBe('red');
        expect(summary.flaggedWindows).toBe(2);
        expect(summary.strongestReasons).toEqual(['psi_major', 'ks', 'es', 'wasserstein']);
        expect(summary.latestMetrics.psi).toBeCloseTo(0.26);
    });

    it('builds a global summary across filtered responses', () => {
        const other = makeResponse('other', [
            {
                ...response.windows[0]!,
                label: '2025-01-01 02:30 - 03:30',
                drift_level: 'green',
                trigger_reasons: [],
                psi: 0.01,
                ks_pvalue: 0.9,
                es_pvalue: 0.9,
                wasserstein: 0.01,
                jensen_shannon: 0.0,
                completeness_delta: 0,
            },
        ]);

        const summary = buildGlobalSummary(new Map([
            ['value', response],
            ['other', other],
        ]));

        expect(summary.anyDrift).toBe(true);
        expect(summary.columnsFlagged).toBe(1);
        expect(summary.totalColumns).toBe(2);
        expect(summary.latestSeverity).toBe('red');
        expect(summary.worstSeverity).toBe('red');
    });

    it('builds the shared compute status with failed columns and quality warnings', () => {
        const warned = {
            ...response,
            metadata: {
                ...response.metadata!,
                psi_sample_ratio_warning: true,
                bin_count_warning: true,
            },
        };
        const summary = statusSummary(new Map([['value', warned]]), ['other']);

        expect(summary.windowsTotal).toBe(2);
        expect(summary.flaggedTotal).toBe(2);
        expect(summary.text).toContain('failed: other');
        expect(summary.text).toContain('PSI may be inflated');
        expect(summary.text).toContain('histogram bins fell back to equal-width');
    });

    it('softens the latest severity when almost every column is already flagged', () => {
        const flagged = new Map(
            Array.from({ length: 10 }, (_, i) => [
                `col-${i}`,
                makeResponse(`col-${i}`, [
                    {
                        ...response.windows[0]!,
                        drift_level: 'red',
                        trigger_reasons: ['psi_major'],
                    },
                ]),
            ]),
        );

        const summary = buildGlobalSummary(flagged);
        expect(summary.columnsFlagged).toBe(10);
        expect(summary.totalColumns).toBe(10);
        expect(summary.latestSeverity).toBe('yellow');
        expect(summary.worstSeverity).toBe('red');
    });

    it('includes trigger reasons and additional metrics in detail stats rows', () => {
        const rows = buildDetailStatRows(response.windows[1] ?? null);
        expect(rows.some((row) => row.label === 'Triggered by' && row.value.includes('PSI major'))).toBe(true);
        expect(rows.some((row) => row.label === 'Jensen-Shannon')).toBe(true);
        expect(rows.some((row) => row.label === 'Completeness delta' && row.value.includes('-18.0%'))).toBe(true);
    });

    it('adds exact ranges and trigger reasons to the timeline tooltip', () => {
        const html = timelineTooltipFormatter({
            seriesName: 'value',
            name: '2025-01-01 01:30 - 02:30',
            value: [0.8, 1.2, 1.6, 1.9, 2.3],
            data: {
                meta: {
                    column: 'value',
                    range_label: '2025-01-01 01:30 - 02:30',
                    count: 9,
                    psi: 0.26,
                    ks_stat: 0.2,
                    wasserstein: 0.3,
                    drift_level: 'red',
                    trigger_reasons: ['psi_major', 'ks', 'es'],
                },
            },
        });

        expect(html).toContain('2025-01-01 01:30 - 02:30');
        expect(html).toContain('PSI major, KS, E-S');
    });

    it('limits timeline tick labels so dense window series stay readable', () => {
        const denseResponse = makeResponse('dense', Array.from({ length: 12 }, (_, i) => ({
            ...response.windows[0]!,
            label: `2025-01-01 00:${String(i * 5).padStart(2, '0')} - 00:${String(i * 5 + 5).padStart(2, '0')}`,
        })));
        const option = buildTimelineOption({
            responsesByColumn: new Map([['dense', denseResponse]]),
            activeDetailColumn: 'dense',
            selectedWindowIdx: null,
        });
        const axisLabel = (option as any).xAxis.axisLabel;
        expect(axisLabel.rotate).toBe(24);
        expect(axisLabel.hideOverlap).toBe(true);
        expect(axisLabel.interval(0)).toBe(true);
        expect(axisLabel.interval(1)).toBe(false);
    });

    it('reserves separate space for the series legend so it does not collide with the toolbox', () => {
        const option = buildTimelineOption({
            responsesByColumn: new Map([['HUFL', response]]),
            activeDetailColumn: 'HUFL',
            selectedWindowIdx: null,
        }) as any;

        expect(option.legend.right).toBeGreaterThan(option.toolbox.right);
        expect(option.legend.itemGap).toBeGreaterThanOrEqual(12);
        expect(option.legend.itemWidth).toBeGreaterThanOrEqual(12);
    });

    it('labels the drift timeline y-axis and shortens daily range labels', () => {
        const dailyResponse = makeResponse('value', [
            {
                ...response.windows[0]!,
                label: '2025-01-01 00:00 - 2025-01-02 00:00',
            },
        ]);
        const option = buildTimelineOption({
            responsesByColumn: new Map([['value', dailyResponse]]),
            activeDetailColumn: 'value',
            selectedWindowIdx: null,
        }) as any;

        expect(option.yAxis.name).toBe('Drift score');
        expect(option.xAxis.axisLabel.formatter('2025-01-01 00:00 - 2025-01-02 00:00')).toBe('2025-01-01');
    });

    it('renders drift window list items with compact day labels when the windows are daily', () => {
        const dailyResponse = makeResponse('value', [
            {
                ...response.windows[0]!,
                label: '2025-01-01 00:00 - 2025-01-02 00:00',
            },
            {
                ...response.windows[1]!,
                label: '2025-01-02 00:00 - 2025-01-03 00:00',
            },
        ]);
        const { html } = buildWindowListHtml(dailyResponse, 0, [0, 1]);
        expect(html).toContain('Day 1');
        expect(html).toContain('Day 2');
        expect(html).not.toContain('2025-01-01 00:00 - 2025-01-02 00:00');
    });
});
