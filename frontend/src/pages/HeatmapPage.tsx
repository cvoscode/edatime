import { Component, createSignal, createResource, For, Show, onMount, createMemo } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { fetchCorrelationMatrix, type CorrelationMatrixResponse } from '../services/api';
import { datasetStore, uiStore } from '../stores';
import { correlationColor, getColorScaleGradientCSS, getContrastTextColor } from '../utils/colorScale';
import styles from './HeatmapPage.module.css';

const MIN_CELL_SIZE = 24;
const MAX_CELL_SIZE = 72;
const BASE_CELL_SIZE = 48;
const MIN_DRAG_PX = 8;
const BUFFER_CELLS = 2;

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const HeatmapPage: Component = () => {
  const navigate = useNavigate();
  const [metric, setMetric] = createSignal<'pearson' | 'spearman'>('pearson');
  const [loadInFlight, setLoadInFlight] = createSignal(false);

  const [matrix] = createResource(async () => {
    setLoadInFlight(true);
    try {
      return await fetchCorrelationMatrix();
    } finally {
      setLoadInFlight(false);
    }
  });

  const [zoomLevel, setZoomLevel] = createSignal(1.0);
  const [visibleRange, setVisibleRange] = createSignal<{ rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null>(null);
  const [isSelecting, setIsSelecting] = createSignal(false);
  const [selectionBox, setSelectionBox] = createSignal<SelectionBox | null>(null);
  const [pointerId, setPointerId] = createSignal<number | null>(null);

  let gridWrapperRef: HTMLDivElement | undefined;

  const cellSize = createMemo(() => {
    const level = zoomLevel();
    return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, Math.round(BASE_CELL_SIZE * level)));
  });

  const totalColumns = createMemo(() => matrix()?.columns.length ?? 0);

  const visibleColumns = createMemo(() => {
    const cols = matrix()?.columns ?? [];
    const range = visibleRange();
    if (!range) return { all: cols, start: 0, end: cols.length };
    const start = Math.max(0, range.colStart - BUFFER_CELLS);
    const end = Math.min(cols.length, range.colEnd + BUFFER_CELLS);
    return { all: cols, start, end };
  });

  const visibleRows = createMemo(() => {
    const cols = matrix()?.columns ?? [];
    const range = visibleRange();
    if (!range) return { all: cols, start: 0, end: cols.length };
    const start = Math.max(0, range.rowStart - BUFFER_CELLS);
    const end = Math.min(cols.length, range.rowEnd + BUFFER_CELLS);
    return { all: cols, start, end };
  });

  const hasData = () => matrix() !== undefined && matrix() !== null;

  onMount(() => {
    const xCol = sessionStorage.getItem('scatter-x-col');
    const yCol = sessionStorage.getItem('scatter-y-col');
    if (xCol) sessionStorage.removeItem('scatter-x-col');
    if (yCol) sessionStorage.removeItem('scatter-y-col');
  });

  const handleCellClick = (rowIdx: number, colIdx: number) => {
    if (isSelecting()) return;
    const data = matrix();
    if (!data || rowIdx === colIdx) return;
    const xCol = data.columns[colIdx];
    const yCol = data.columns[rowIdx];
    sessionStorage.setItem('scatter-x-col', xCol);
    sessionStorage.setItem('scatter-y-col', yCol);
    navigate('/scatter');
  };

  const getValue = (rowIdx: number, colIdx: number): number | null => {
    const data = matrix();
    if (!data) return null;
    return metric() === 'pearson'
      ? data.pearson[rowIdx]?.[colIdx] ?? null
      : data.spearman[rowIdx]?.[colIdx] ?? null;
  };

  const isDiagonal = (rowIdx: number, colIdx: number): boolean => {
    return rowIdx === colIdx;
  };

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => clamp(prev + delta, 0.5, 4.0));
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsSelecting(true);
    setPointerId(e.pointerId);
    setSelectionBox({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isSelecting() || pointerId() !== e.pointerId) return;
    const box = selectionBox();
    if (!box) return;
    setSelectionBox({ ...box, endX: e.clientX, endY: e.clientY });
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isSelecting() || pointerId() !== e.pointerId) return;
    const box = selectionBox();
    if (box) {
      const dx = Math.abs(box.endX - box.startX);
      const dy = Math.abs(box.endY - box.startY);
      if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) {
        applyZoomSelection(box);
      }
    }
    setIsSelecting(false);
    setSelectionBox(null);
    setPointerId(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const applyZoomSelection = (box: SelectionBox) => {
    if (!gridWrapperRef) return;
    const wrapper = gridWrapperRef;
    const rect = wrapper.getBoundingClientRect();
    const scrollLeft = wrapper.scrollLeft;
    const scrollTop = wrapper.scrollTop;
    const cellW = cellSize();
    const cellH = cellSize();

    const selX1 = Math.min(box.startX, box.endX) - rect.left + scrollLeft;
    const selX2 = Math.max(box.startX, box.endX) - rect.left + scrollLeft;
    const selY1 = Math.min(box.startY, box.endY) - rect.top + scrollTop;
    const selY2 = Math.max(box.startY, box.endY) - rect.top + scrollTop;

    const n = totalColumns();
    const rowLabelWidth = cellW;

    const colStart = clamp(Math.floor((selX1 - rowLabelWidth) / cellW), 0, n - 1);
    const colEnd = clamp(Math.ceil((selX2 - rowLabelWidth) / cellW), 0, n - 1);
    const rowStart = clamp(Math.floor(selY1 / cellH), 0, n - 1);
    const rowEnd = clamp(Math.ceil(selY2 / cellH), 0, n - 1);

    const newZoom = clamp(wrapper.clientWidth / ((colEnd - colStart + 1) * cellW + rowLabelWidth) * zoomLevel(), 0.5, 4.0);
    setZoomLevel(newZoom);

    const newCellSize = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, Math.round(BASE_CELL_SIZE * newZoom)));
    const contentWidth = (colEnd - colStart + 1) * newCellSize + newCellSize;
    const contentHeight = (rowEnd - rowStart + 1) * newCellSize;
    const targetScrollX = Math.max(0, (colStart - 1) * newCellSize + newCellSize - (wrapper.clientWidth - contentWidth) / 2);
    const targetScrollY = Math.max(0, rowStart * newCellSize - (wrapper.clientHeight - contentHeight) / 2);

    setVisibleRange({ rowStart, rowEnd, colStart, colEnd });

    requestAnimationFrame(() => {
      wrapper.scrollLeft = targetScrollX;
      wrapper.scrollTop = targetScrollY;
    });
  };

  const handleDoubleClick = () => {
    setZoomLevel(1.0);
    setVisibleRange(null);
    if (gridWrapperRef) {
      gridWrapperRef.scrollLeft = 0;
      gridWrapperRef.scrollTop = 0;
    }
  };

  const selectionStyle = createMemo(() => {
    const box = selectionBox();
    if (!box) return { display: 'none' };
    const left = Math.min(box.startX, box.endX);
    const top = Math.min(box.startY, box.endY);
    const width = Math.abs(box.endX - box.startX);
    const height = Math.abs(box.endY - box.startY);
    return { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
  });

  return (
    <div class={styles.page}>
      <div class={styles.toolbar}>
        <div class={styles.toolbarLeft}>
          <h1 class={styles.title}>Correlation Heatmap</h1>
          <Show when={hasData()}>
            <span class={styles.meta}>{matrix()!.columns.length} × {matrix()!.columns.length} variables</span>
          </Show>
          <Show when={visibleRange()}>
            <button class={styles.resetZoomBtn} onClick={handleDoubleClick}>Reset zoom</button>
          </Show>
        </div>
        <div class={styles.toolbarRight}>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Metric</label>
            <select
              class={styles.select}
              value={metric()}
              onChange={(e) => setMetric(e.currentTarget.value as 'pearson' | 'spearman')}
            >
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
          </div>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Zoom</label>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={zoomLevel()}
              onInput={(e) => setZoomLevel(parseFloat(e.currentTarget.value))}
              class={styles.slider}
            />
            <span class={styles.sliderValue}>{Math.round(zoomLevel() * 100)}%</span>
          </div>
        </div>
      </div>

      <div class={styles.content}>
        <Show when={loadInFlight()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.spinner} />
            <span class={styles.loadingLabel}>Loading correlation matrix...</span>
          </div>
        </Show>

        <Show when={!loadInFlight() && hasData() && matrix()!.columns.length === 0}>
          <div class={styles.empty}>No numeric columns available for correlation analysis.</div>
        </Show>

        <Show when={!loadInFlight() && hasData() && matrix()!.columns.length > 0}>
          <div
            class={styles.gridWrapper}
            ref={gridWrapperRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDblClick={handleDoubleClick}
            style={{ cursor: isSelecting() ? 'crosshair' : 'default' }}
          >
            <div
              class={styles.grid}
              style={{
                '--cell-size': `${cellSize()}px`,
                'grid-template-columns': `var(--cell-size) repeat(${matrix()!.columns.length}, var(--cell-size))`,
              }}
            >
              <div class={styles.cornerCell} />
              <For each={matrix()!.columns}>
                {(col) => (
                  <div class={styles.headerCell}>{col}</div>
                )}
              </For>

              <For each={matrix()!.columns}>
                {(rowCol, rowIdx) => (
                  <>
                    <div class={styles.rowLabel}>{rowCol}</div>
                    <For each={matrix()!.columns}>
                      {(_, colIdx) => {
                        const value = () => getValue(rowIdx(), colIdx());
                        const bgColor = () => correlationColor(value(), uiStore.state.colorScale);
                        const textColor = () => getContrastTextColor(bgColor());
                        const isDiag = () => isDiagonal(rowIdx(), colIdx());
                        return (
                          <div
                            class={`${styles.cell} ${isDiag() ? styles.diagonal : styles.clickable}`}
                            style={{ background: bgColor() }}
                            onClick={() => handleCellClick(rowIdx(), colIdx())}
                            title={isDiag() ? '' : `${matrix()!.columns[colIdx()]} vs ${rowCol}`}
                          >
                            <Show when={value() !== null}>
                              <span class={styles.cellValue} style={{ color: textColor() }}>
                                {isDiag() ? '1.00' : value()!.toFixed(2)}
                              </span>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </>
                )}
              </For>
            </div>

            <div
              class={styles.selectionOverlay}
              style={selectionStyle()}
            />
          </div>

          <div class={styles.legend}>
            <span class={styles.legendLabel} style={{ color: getContrastTextColor(correlationColor(-1, uiStore.state.colorScale)) }}>−1</span>
            <div class={styles.legendGradient} style={{ background: getColorScaleGradientCSS(uiStore.state.colorScale) }} />
            <span class={styles.legendLabel} style={{ color: getContrastTextColor(correlationColor(0, uiStore.state.colorScale)) }}>0</span>
            <span class={styles.legendLabel} style={{ color: getContrastTextColor(correlationColor(1, uiStore.state.colorScale)) }}>+1</span>
          </div>

          <p class={styles.hint}>Click any cell to explore that pair in the Scatter view → | Drag to box-zoom | Scroll to zoom | Double-click to reset</p>
        </Show>

        <Show when={!loadInFlight() && !hasData()}>
          <div class={styles.empty}>No dataset loaded. Please upload or select a sample dataset first.</div>
        </Show>
      </div>
    </div>
  );
};

export default HeatmapPage;