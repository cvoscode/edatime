/**
 * Scatter domain index — re-exports all public types, store accessors, hooks,
 * and components so consumers can do a single import:
 *   import { scatterDomain, useScatterData, ScatterChart } from '../../domain/scatter';
 */
export * from './types';
export * from './store';
export * from './hooks';
export { ScatterChart } from './components/ScatterChart';
export { ColumnSelectors } from './components/ColumnSelectors';
export { DistributionCards } from './components/DistributionCards';
export { CorrelationMatrix } from './components/CorrelationMatrix';
// Re-export ColorLegend from the existing domain components if available
import ColorLegend from './components/ColorLegend';
export { ColorLegend };