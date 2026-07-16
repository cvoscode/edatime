import type { CleaningPlan } from './types.js';

function quote(value: string): string { return JSON.stringify(value); }
function numeric(value: number): string { return Number.isFinite(value) ? String(value) : '0'; }

/** Portable code for the v1 row-filter stages supported by the backend compiler. */
export function generatePythonPolars(plan: CleaningPlan): string {
    const lines = [
        '# Client-side EdaTime plan preview.',
        '# Revalidate against the backend-exported canonical plan before execution.',
        '',
        'import polars as pl',
        '',
        'def apply_edatime_plan(lf: pl.LazyFrame) -> pl.LazyFrame:',
    ];
    let body = false;
    for (const stage of plan.stages) {
        if (!stage.enabled || stage.kind === 'annotation') continue;
        if (stage.kind === 'derivedColumn') {
            throw new Error('Use the backend canonical code export for derived-column stages.');
        }
        body = true;
        if (stage.kind === 'timeRange') {
            const predicate = `(pl.col(${quote(plan.timeColumn)}) >= ${numeric(Math.min(stage.startMs, stage.endMs))}) & (pl.col(${quote(plan.timeColumn)}) <= ${numeric(Math.max(stage.startMs, stage.endMs))})`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `(${predicate}).not() | (${predicate}).is_null()`})`);
        } else if (stage.kind === 'columnRange') {
            const predicate = `(pl.col(${quote(stage.column)}) >= ${numeric(Math.min(stage.from, stage.to))}) & (pl.col(${quote(stage.column)}) <= ${numeric(Math.max(stage.from, stage.to))})`;
            const expression = stage.mode === 'keepInside'
                ? (stage.retainNulls ? `pl.col(${quote(stage.column)}).is_null() | (${predicate})` : predicate)
                : `(${predicate}).not() | (${predicate}).is_null()`;
            lines.push(`    lf = lf.filter(${expression})`);
        } else if (stage.kind === 'missingValue') {
            const value = `pl.col(${quote(stage.column)})`;
            const predicate = stage.dropNulls && stage.dropNonFinite
                ? `${value}.is_not_null() & ${value}.is_finite()`
                : stage.dropNulls ? `${value}.is_not_null()` : `${value}.is_null() | ${value}.is_finite()`;
            lines.push(`    lf = lf.filter(${predicate})`);
        } else if (stage.kind === 'deduplicate') {
            lines.push(`    lf = lf.unique(subset=[${stage.columns.map(quote).join(', ')}], keep=${quote(stage.keep)}, maintain_order=True)`);
        } else if (stage.kind === 'columnSelect') {
            lines.push(stage.mode === 'keep'
                ? `    lf = lf.select([${stage.columns.map((column) => `pl.col(${quote(column)})`).join(', ')}])`
                : `    lf = lf.drop([${stage.columns.map(quote).join(', ')}])`);
        } else if (stage.kind === 'sort') {
            lines.push(`    lf = lf.sort(by=[${stage.columns.map(quote).join(', ')}], descending=${stage.descending ? 'True' : 'False'}, nulls_last=${stage.nullsLast ? 'True' : 'False'}, maintain_order=True)`);
        } else if (stage.kind === 'fillNull') {
            lines.push('    # Ordered null fill requires an earlier stable sort on the time column.');
            lines.push(`    lf = lf.with_columns([${stage.columns.map((column) => `pl.col(${quote(column)}).fill_null(strategy=${quote(stage.strategy)}, limit=${stage.limit == null ? 'None' : String(stage.limit)})`).join(', ')}])`);
        } else if (stage.kind === 'resample') {
            lines.push('    # Global fixed-duration buckets; empty buckets are not synthesized.');
            lines.push(`    lf = lf.group_by_dynamic(${quote(plan.timeColumn)}, every=${quote(stage.every)}, period=${quote(stage.every)}, closed="left", label="left", start_by="window").agg([${stage.aggregations.map(({ column, method }) => `pl.col(${quote(column)}).${method}().alias(${quote(column)})`).join(', ')}])`);
        } else if (stage.kind === 'chronologicalSplit') {
            lines.push(`    # Chronological train / embargo / validation / embargo / test labels.`);
            lines.push(`    lf = lf.with_columns(pl.when(pl.col(${quote(plan.timeColumn)}).is_null()).then(pl.lit("unassigned")).when(pl.col(${quote(plan.timeColumn)}) <= ${numeric(stage.trainEndMs)}).then(pl.lit("train")).when(pl.col(${quote(plan.timeColumn)}) <= ${numeric(stage.trainEndMs + stage.embargoMs)}).then(pl.lit("embargo")).when(pl.col(${quote(plan.timeColumn)}) <= ${numeric(stage.validationEndMs)}).then(pl.lit("validation")).when(pl.col(${quote(plan.timeColumn)}) <= ${numeric(stage.validationEndMs + stage.embargoMs)}).then(pl.lit("embargo")).otherwise(pl.lit("test")).alias(${quote(stage.outputColumn)}))`);
        } else {
            const slope = (stage.y2 - stage.y1) / (stage.x2Ms - stage.x1Ms);
            const compare = `pl.col(${quote(stage.column)}) ${stage.keepAbove ? '>=' : '<='} (${numeric(stage.y1)} + ((pl.col(${quote(plan.timeColumn)}) - ${numeric(stage.x1Ms)}) * ${numeric(slope)}))`;
            const predicate = stage.applyWithinSegmentOnly
                ? `~((pl.col(${quote(plan.timeColumn)}) >= ${numeric(Math.min(stage.x1Ms, stage.x2Ms))}) & (pl.col(${quote(plan.timeColumn)}) <= ${numeric(Math.max(stage.x1Ms, stage.x2Ms))})) | (${compare})`
                : compare;
            lines.push(`    lf = lf.filter(${predicate})`);
        }
    }
    lines.push(body ? '    return lf' : '    return lf  # no enabled executable stages');
    return `${lines.join('\n')}\n`;
}

export function generateRustPolars(plan: CleaningPlan): string {
    const lines = [
        '// Client-side EdaTime plan preview.',
        '// Revalidate against the backend-exported canonical plan before execution.',
        '',
        'use polars::prelude::*;',
        '',
        'pub fn apply_edatime_plan(mut lf: LazyFrame) -> PolarsResult<LazyFrame> {',
    ];
    for (const stage of plan.stages) {
        if (!stage.enabled || stage.kind === 'annotation') continue;
        if (stage.kind === 'derivedColumn') {
            throw new Error('Use the backend canonical code export for derived-column stages.');
        }
        if (stage.kind === 'timeRange') {
            const predicate = `col(${quote(plan.timeColumn)}).gt_eq(lit(${numeric(Math.min(stage.startMs, stage.endMs))})).and(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(Math.max(stage.startMs, stage.endMs))})))`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `${predicate}.is_null().or(${predicate}.not())`});`);
        } else if (stage.kind === 'columnRange') {
            const predicate = `col(${quote(stage.column)}).cast(DataType::Float64).gt_eq(lit(${numeric(Math.min(stage.from, stage.to))})).and(col(${quote(stage.column)}).cast(DataType::Float64).lt_eq(lit(${numeric(Math.max(stage.from, stage.to))})))`;
            const expression = stage.mode === 'keepInside'
                ? (stage.retainNulls ? `col(${quote(stage.column)}).is_null().or(${predicate})` : predicate)
                : `${predicate}.is_null().or(${predicate}.not())`;
            lines.push(`    lf = lf.filter(${expression});`);
        } else if (stage.kind === 'missingValue') {
            const value = `col(${quote(stage.column)})`;
            const predicate = stage.dropNulls && stage.dropNonFinite
                ? `${value}.is_not_null().and(${value}.is_finite())`
                : stage.dropNulls ? `${value}.is_not_null()` : `${value}.is_null().or(${value}.is_finite())`;
            lines.push(`    lf = lf.filter(${predicate});`);
        } else if (stage.kind === 'deduplicate') {
            lines.push(`    lf = lf.unique_stable_generic(Some(vec![${stage.columns.map((column) => `col(${quote(column)})`).join(', ')}]), UniqueKeepStrategy::${stage.keep === 'first' ? 'First' : 'Last'});`);
        } else if (stage.kind === 'columnSelect') {
            lines.push(stage.mode === 'keep'
                ? `    lf = lf.select(vec![${stage.columns.map((column) => `col(${quote(column)})`).join(', ')}]);`
                : `    lf = lf.drop(by_name([${stage.columns.map(quote).join(', ')}], true, false));`);
        } else if (stage.kind === 'sort') {
            lines.push(`    lf = lf.sort(vec![${stage.columns.map(quote).join(', ')}], SortMultipleOptions::default().with_order_descending(${stage.descending}).with_nulls_last(${stage.nullsLast}).with_maintain_order(true));`);
        } else if (stage.kind === 'fillNull') {
            const strategy = stage.strategy === 'forward' ? 'Forward' : 'Backward';
            lines.push('    // Ordered null fill requires an earlier stable sort on the time column.');
            lines.push(`    lf = lf.with_columns(vec![${stage.columns.map((column) => `col(${quote(column)}).fill_null_with_strategy(FillNullStrategy::${strategy}(${stage.limit == null ? 'None' : `Some(${stage.limit})`}))`).join(', ')}]);`);
        } else if (stage.kind === 'resample') {
            const aggregations = stage.aggregations.map(({ column, method }) => `col(${quote(column)}).${method}().alias(${quote(column)})`).join(', ');
            lines.push('    // Global fixed-duration buckets; empty buckets are not synthesized.');
            lines.push(`    let every = Duration::try_parse(${quote(stage.every)})?;`);
            lines.push(`    lf = lf.group_by_dynamic(col(${quote(plan.timeColumn)}), [], DynamicGroupOptions { every, period: every, offset: Duration::try_parse("0ns")?, closed_window: ClosedWindow::Left, label: Label::Left, start_by: StartBy::WindowBound, ..Default::default() }).agg([${aggregations}]);`);
        } else if (stage.kind === 'chronologicalSplit') {
            lines.push(`    lf = lf.with_columns(vec![when(col(${quote(plan.timeColumn)}).is_null()).then(lit("unassigned")).when(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(stage.trainEndMs)}))).then(lit("train")).when(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(stage.trainEndMs + stage.embargoMs)}))).then(lit("embargo")).when(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(stage.validationEndMs)}))).then(lit("validation")).when(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(stage.validationEndMs + stage.embargoMs)}))).then(lit("embargo")).otherwise(lit("test")).alias(${quote(stage.outputColumn)})]);`);
        } else {
            lines.push(`    // Adaptive line stage ${quote(stage.id)}: use the same time-unit conversion as your input frame.`);
        }
    }
    lines.push('    Ok(lf)', '}');
    return `${lines.join('\n')}\n`;
}
