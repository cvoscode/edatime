/**
 * Chart export hook — consolidates export logic across pages.
 * Reduces duplicate export handlers in TimeseriesPage, ScatterPage.
 */
import { createSignal, Accessor } from 'solid-js';
import { exportChartAsPNG, exportChartAsCSV, exportChartAsSVG, exportChartAsJSON, exportChartAsHTML } from '../utils/exportUtils';

/**
 * Results from createExportHandlers()
 */
export interface ExportHandlers {
  /** Trigger PNG download */
  handleExportPNG: () => void;
  /** Trigger CSV download */
  handleExportCSV: () => void;
  /** Trigger SVG download */
  handleExportSVG: () => void;
  /** Trigger JSON download */
  handleExportJSON: () => void;
  /** Trigger HTML download (includes both chart + overlay canvases) */
  handleExportHTML: () => void;
}

/**
 * Creates standardized export handlers for a chart.
 * Requires chartInstance (from onChartReady callback).
 * 
 * @param chartInstance - Accessor returning the chart instance
 * @param getSeriesData - Optional accessor returning { xValues, series } for CSV/JSON exports
 * @param options - Optional filename overrides
 */
export function createExportHandlers(
  chartInstance: Accessor<any>,
  getSeriesData?: () => { xValues: Float64Array; series: Record<string, Float64Array> } | null,
  options?: {
    pngFilename?: string;
    csvFilename?: string;
    svgFilename?: string;
    jsonFilename?: string;
    htmlFilename?: string;
  }
): ExportHandlers {
  const defaults = {
    pngFilename: 'edatime_chart.png',
    csvFilename: 'edatime_data.csv',
    svgFilename: 'edatime_chart.svg',
    jsonFilename: 'edatime_data.json',
    htmlFilename: 'edatime_chart.html',
  };

  const getFilename = (name: keyof typeof defaults) => {
    return options?.[name] ?? defaults[name];
  };

  const handleExportPNG = () => {
    const instance = chartInstance();
    if (instance) {
      exportChartAsPNG(instance, getFilename('pngFilename'));
    }
  };

  const handleExportCSV = () => {
    const data = getSeriesData?.();
    if (data) {
      exportChartAsCSV(data.xValues, data.series, getFilename('csvFilename'));
    }
  };

  const handleExportSVG = () => {
    const instance = chartInstance();
    if (instance) {
      exportChartAsSVG(instance, getFilename('svgFilename'));
    }
  };

  const handleExportJSON = () => {
    const data = getSeriesData?.();
    if (data) {
      exportChartAsJSON(data.xValues, data.series, getFilename('jsonFilename'));
    }
  };

  const handleExportHTML = () => {
    const instance = chartInstance();
    if (instance) {
      exportChartAsHTML(instance, getFilename('htmlFilename'));
    }
  };

  return {
    handleExportPNG,
    handleExportCSV,
    handleExportSVG,
    handleExportJSON,
    handleExportHTML,
  };
}

/**
 * Creates a "more exports" dropdown toggle state.
 * Returns: { showMore, setShowMore, toggleMore }
 */
export function createExportMoreState() {
  const [showMore, setShowMore] = createSignal(false);
  const toggleMore = () => setShowMore(prev => !prev);
  return { showMore, setShowMore, toggleMore };
}