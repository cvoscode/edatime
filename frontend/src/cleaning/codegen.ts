import type { CleaningPlan } from './types.js';

function quote(value: string): string { return JSON.stringify(value); }
function numeric(value: number): string { return Number.isFinite(value) ? String(value) : '0'; }

/** Portable code for the v1 row-filter stages supported by the backend compiler. */
export function generatePythonPolars(plan: CleaningPlan): string {
    const lines = ['import polars as pl', '', 'def apply_edatime_plan(lf: pl.LazyFrame) -> pl.LazyFrame:'];
    let body = false;
    for (const stage of plan.stages) {
        if (!stage.enabled || stage.kind === 'annotation') continue;
        body = true;
        if (stage.kind === 'timeRange') {
            const predicate = `(pl.col(${quote(plan.timeColumn)}) >= ${numeric(Math.min(stage.startMs, stage.endMs))}) & (pl.col(${quote(plan.timeColumn)}) <= ${numeric(Math.max(stage.startMs, stage.endMs))})`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `(${predicate}).not() | (${predicate}).is_null()`})`);
        } else if (stage.kind === 'columnRange') {
            const predicate = `(pl.col(${quote(stage.column)}) >= ${numeric(Math.min(stage.from, stage.to))}) & (pl.col(${quote(stage.column)}) <= ${numeric(Math.max(stage.from, stage.to))})`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `(${predicate}).not() | (${predicate}).is_null()`})`);
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
    const lines = ['use polars::prelude::*;', '', 'pub fn apply_edatime_plan(mut lf: LazyFrame) -> PolarsResult<LazyFrame> {'];
    for (const stage of plan.stages) {
        if (!stage.enabled || stage.kind === 'annotation') continue;
        if (stage.kind === 'timeRange') {
            const predicate = `col(${quote(plan.timeColumn)}).gt_eq(lit(${numeric(Math.min(stage.startMs, stage.endMs))})).and(col(${quote(plan.timeColumn)}).lt_eq(lit(${numeric(Math.max(stage.startMs, stage.endMs))})))`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `${predicate}.is_null().or(${predicate}.not())`});`);
        } else if (stage.kind === 'columnRange') {
            const predicate = `col(${quote(stage.column)}).cast(DataType::Float64).gt_eq(lit(${numeric(Math.min(stage.from, stage.to))})).and(col(${quote(stage.column)}).cast(DataType::Float64).lt_eq(lit(${numeric(Math.max(stage.from, stage.to))})))`;
            lines.push(`    lf = lf.filter(${stage.mode === 'keepInside' ? predicate : `${predicate}.is_null().or(${predicate}.not())`});`);
        } else {
            lines.push(`    // Adaptive line stage ${quote(stage.id)}: use the same time-unit conversion as your input frame.`);
        }
    }
    lines.push('    Ok(lf)', '}');
    return `${lines.join('\n')}\n`;
}
