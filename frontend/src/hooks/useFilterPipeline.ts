/**
 * useFilterPipeline — abstracts column filter + adaptive filter interaction for timeseries pages.
 *
 * Does NOT auto-fetch; provides filtered data given raw xValues/series.
 */
import { createSignal } from 'solid-js';
import type { AdaptiveLineFilter } from '../types';
import { applyColumnRanges } from '../services/dataFetch';

export interface ColumnFilters {
  [column: string]: { min: number; max: number };
}

export interface FilterPipeline {
  /** Current column filters */
  columnFilters: () => ColumnFilters;

  /** Current adaptive line filters */
  adaptiveFilters: () => AdaptiveLineFilter[];

  /** Add or update a column range filter (merges with existing) */
  setColumnFilter: (column: string, range: { min: number; max: number }) => void;

  /** Remove a column filter */
  removeColumnFilter: (column: string) => void;

  /** Clear all column filters */
  clearColumnFilters: () => void;

  /** Add an adaptive line filter */
  addAdaptiveFilter: (filter: AdaptiveLineFilter) => void;

  /** Remove an adaptive line filter by id */
  removeAdaptiveFilter: (id: string) => void;

  /** Clear all adaptive filters */
  clearAdaptiveFilters: () => void;

  /**
   * Apply all active filters to raw timeseries data.
   * Returns filtered xValues and series.
   */
  applyFilters: (
    xValues: Float64Array,
    series: Record<string, Float64Array>
  ) => { xValues: Float64Array; series: Record<string, Float64Array> };

  /** Check if any filters are active */
  hasActiveFilters: () => boolean;
}

export function useFilterPipeline(): FilterPipeline {
  const [columnFilters, setColumnFilters] = createSignal<ColumnFilters>({});
  const [adaptiveFilters, setAdaptiveFilters] = createSignal<AdaptiveLineFilter[]>([]);

  const setColumnFilter = (column: string, range: { min: number; max: number }) => {
    setColumnFilters(prev => ({ ...prev, [column]: range }));
  };

  const removeColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[column];
      return next;
    });
  };

  const clearColumnFilters = () => {
    setColumnFilters({});
  };

  const addAdaptiveFilter = (filter: AdaptiveLineFilter) => {
    setAdaptiveFilters(prev => [...prev, filter]);
  };

  const removeAdaptiveFilter = (id: string) => {
    setAdaptiveFilters(prev => prev.filter(f => f.id !== id));
  };

  const clearAdaptiveFilters = () => {
    setAdaptiveFilters([]);
  };

  const applyFilters = (
    xValues: Float64Array,
    series: Record<string, Float64Array>
  ): { xValues: Float64Array; series: Record<string, Float64Array> } => {
    return applyColumnRanges(xValues, series, columnFilters(), adaptiveFilters());
  };

  const hasActiveFilters = (): boolean => {
    return Object.keys(columnFilters()).length > 0 || adaptiveFilters().length > 0;
  };

  return {
    columnFilters,
    adaptiveFilters,
    setColumnFilter,
    removeColumnFilter,
    clearColumnFilters,
    addAdaptiveFilter,
    removeAdaptiveFilter,
    clearAdaptiveFilters,
    applyFilters,
    hasActiveFilters,
  };
}