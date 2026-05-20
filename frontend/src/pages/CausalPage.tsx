import { Component, createSignal, createMemo, Show, For, onMount, onCleanup, createEffect } from 'solid-js';
import { datasetStore } from '../stores';
import { uiStore } from '../stores/uiStore';
import { causalStore, type CausalMethod, type CausalTest, type FdrMethod, type CausalLink } from '../stores/causalStore';
import ColumnChips from '../domain/timeseries/components/ColumnChips';
import * as echarts from 'echarts';
import styles from './CausalPage.module.css';

const API_BASE = '/api';

const METHOD_OPTIONS: { value: CausalMethod; label: string }[] = [
  { value: 'pcmci', label: 'PCMCI' },
  { value: 'pcmciplus', label: 'PCMCI+' },
  { value: 'fullci', label: 'FullCI' },
  { value: 'bivci', label: 'BivCI' },
  { value: 'lpcmci', label: 'LPCMCI' },
];

const TEST_OPTIONS: { value: CausalTest; label: string }[] = [
  { value: 'par_corr', label: 'Linear partial correlation (ParCorr)' },
  { value: 'robust_parcorr', label: 'Robust partial correlation' },
  { value: 'cmi_knn', label: 'Conditional mutual information (KNN)' },
  { value: 'gsquared', label: 'G-squared (likelihood ratio)' },
  { value: 'cmi_symb', label: 'CMI (symbolic/discretized)' },
];

const FDR_OPTIONS: { value: FdrMethod; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fdr_bh', label: 'Benjamini-Hochberg' },
];

const PC_STAGE_METHODS: Set<CausalMethod> = new Set(['pcmci', 'pcmciplus', 'lpcmci']);

interface CtxMenuState {
  visible: boolean;
  x: number;
  y: number;
  kind: 'node' | 'edge';
  target: string;
}

interface EditPanelState {
  open: boolean;
  kind: 'node' | 'edge';
  nodeA?: string;
  nodeB?: string;
  connections?: CausalLink[];
}

const CausalPage: Component = () => {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const [columnFilter, setColumnFilter] = createSignal('');
  const [addEdgeMode, setAddEdgeMode] = createSignal(false);
  const [addEdgeFirst, setAddEdgeFirst] = createSignal<string | null>(null);
  const [ctxMenu, setCtxMenu] = createSignal<CtxMenuState>({ visible: false, x: 0, y: 0, kind: 'node', target: '' });
  const [editPanel, setEditPanel] = createSignal<EditPanelState>({ open: false, kind: 'node' });
  const [nodeLabels, setNodeLabels] = createSignal<Map<string, string>>(new Map());
  const [chipColors, setChipColors] = createSignal<Map<string, string>>(new Map());
  const [nodePositions, setNodePositions] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const [exportMenuOpen, setExportMenuOpen] = createSignal(false);
  const [compareResult, setCompareResult] = createSignal<{ added: CausalLink[]; removed: CausalLink[] } | null>(null);

  const numericCols = createMemo(() => datasetStore.state.numericCols ?? []);
  const selectedColumns = createMemo(() => causalStore.state.selectedColumns);
  const links = createMemo(() => causalStore.state.links);
  const loading = createMemo(() => causalStore.state.loading);
  const savedRuns = createMemo(() => causalStore.state.savedRuns);
  const compareRunA = createMemo(() => causalStore.state.compareRunA);
  const compareRunB = createMemo(() => causalStore.state.compareRunB);

  const colorPalette = createMemo(() => {
    const cols = numericCols();
    const colors: Record<string, string> = {};
    const palette = ['#00a8ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#22b8cf', '#f06595', '#94d82d', '#748ffc'];
    cols.forEach((col, i) => {
      colors[col] = chipColors().get(col) ?? palette[i % palette.length];
    });
    return colors;
  });

  const usesPcStage = createMemo(() => PC_STAGE_METHODS.has(causalStore.state.method));

  const handleColumnChange = (cols: string[]) => {
    causalStore.setSelectedColumns(cols);
  };

  const handleColorChange = (col: string, color: string) => {
    setChipColors(prev => new Map(prev).set(col, color));
  };

  const fetchCausalGraph = async () => {
    const cols = causalStore.state.selectedColumns;
    if (cols.length < 2) {
      uiStore.addToast({ message: 'Select at least 2 columns for causal discovery.', type: 'warning', duration: 4000 });
      return;
    }
    causalStore.setLoading(true);
    causalStore.setError(null);
    uiStore.addToast({ message: 'Computing causal graph...', type: 'info', duration: 2000 });
    try {
      const body: Record<string, unknown> = {
        columns: cols.join(','),
        tau_max: causalStore.state.tauMax,
        alpha: causalStore.state.alpha,
        method: causalStore.state.method,
        max_points: 5000,
        pc_alpha: causalStore.state.pcAlpha,
        test: causalStore.state.test,
        fdr_method: causalStore.state.fdrMethod,
      };
      if (causalStore.state.maxCondsDim != null) {
        body.max_conds_dim = causalStore.state.maxCondsDim;
      }
      const res = await fetch(`${API_BASE}/analytics/causal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Causal graph failed (${res.status}) ${text}`);
      }
      const data = await res.json();
      causalStore.setGraphResult(data);
      uiStore.addToast({ message: `${cols.length} nodes · ${data.links.length} links`, type: 'success', duration: 5000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      causalStore.setError(msg);
      uiStore.addToast({ message: `Error: ${msg}`, type: 'error', duration: 0 });
    } finally {
      causalStore.setLoading(false);
    }
  };

  const buildPairGroups = createMemo(() => {
    const allLinks = links();
    const groupsMap = new Map<string, CausalLink[]>();
    for (const link of allLinks) {
      const key = link.source < link.target ? `${link.source}||${link.target}` : `${link.target}||${link.source}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(link);
    }
    return Array.from(groupsMap.entries()).map(([key, conns]) => {
      const [nodeA, nodeB] = key.split('||');
      const lags = [...new Set(conns.map(c => c.lag))].sort((a, b) => a - b);
      const meanValue = conns.reduce((s, c) => s + Number(c.value || 0), 0) / conns.length;
      const minPValue = conns.reduce((m, c) => Math.min(m, Number(c.pvalue || 1)), 1);
      const hasUndirected = conns.some(c => c.type === 'o-o' || c.type === 'x-x');
      const hasAmbiguous = conns.some(c => c.type === '-?>');
      let forward = 0, backward = 0;
      for (const link of conns) {
        if (link.type === '<--' || link.type === '<-o') {
          if (link.target === nodeA && link.source === nodeB) forward++;
          else backward++;
        } else {
          if (link.source === nodeA && link.target === nodeB) forward++;
          else backward++;
        }
      }
      let direction: 'a_to_b' | 'b_to_a' | 'mixed' = 'mixed';
      if (forward > 0 && backward === 0) direction = 'a_to_b';
      else if (backward > 0 && forward === 0) direction = 'b_to_a';
      return {
        key,
        nodeA,
        nodeB,
        connections: conns,
        lags,
        meanValue,
        minPValue,
        hasUndirected,
        hasAmbiguous,
        direction,
      };
    });
  });

  const renderChart = () => {
    if (!chartInstance || !chartContainer) return;
    const cols = causalStore.state.selectedColumns;
    const groups = buildPairGroups();
    if (cols.length === 0) {
      chartInstance.clear();
      return;
    }
    const positions = nodePositions();
    const width = chartContainer.clientWidth || 600;
    const height = chartContainer.clientHeight || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(90, Math.min(width, height) * 0.34);

    const missingCols = cols.filter(c => !positions.has(c));
    if (missingCols.length > 0) {
      const newPositions = new Map(positions);
      missingCols.forEach((col, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(missingCols.length, 1) - Math.PI / 2;
        newPositions.set(col, {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });
      setNodePositions(newPositions);
    }

    const nodeData = cols.map((col) => {
      const pos = positions.get(col) ?? { x: centerX, y: centerY };
      const label = nodeLabels().get(col) || col;
      const color = chipColors().get(col) || '#00a8ff';
      return {
        id: col,
        name: label,
        x: pos.x,
        y: pos.y,
        fixed: true,
        draggable: true,
        symbolSize: 48,
        symbol: 'circle',
        label: {
          show: true,
          position: 'inside' as const,
          color: '#e0e6f0',
          fontSize: 10,
          fontWeight: 'bold' as const,
          formatter: (params: any) => {
            const value = String((params as any).data?.name || '');
            return value.length > 8 ? `${value.slice(0, 7)}…` : value;
          },
        },
        itemStyle: {
          color: 'rgba(14,18,32,0.92)',
          borderColor: color,
          borderWidth: 2,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#00d4ff',
            borderWidth: 3,
            shadowBlur: 14,
            shadowColor: 'rgba(0,212,255,0.45)',
          },
        },
      };
    });

    const edgeData = groups.map(group => {
      const absVal = Math.min(1, Math.abs(group.meanValue || 0));
      let color = group.meanValue >= 0 ? `hsla(200,80%,60%,${0.34 + absVal * 0.46})` : `hsla(10,80%,60%,${0.34 + absVal * 0.46})`;
      let lineType: 'solid' | 'dashed' = 'solid';
      if (group.direction === 'mixed') color = 'rgba(120,139,174,0.58)';
      if (group.hasUndirected || group.hasAmbiguous) { color = 'rgba(180,160,80,0.62)'; lineType = 'dashed'; }
      const countWeight = Math.sqrt(Math.max(group.connections.length, 1));
      const width = Math.max(2, 1.25 + countWeight * 1.25 + absVal * 1.1);
      let symbols: [string, string] = ['none', 'none'];
      if (group.direction === 'a_to_b') symbols = ['none', 'arrow'];
      else if (group.direction === 'b_to_a') symbols = ['arrow', 'none'];
      const lagText = group.lags.length <= 4 ? group.lags.join(', ') : `${group.lags[0]}-${group.lags[group.lags.length - 1]}`;
      const labelText = `${group.connections.length} links\nτ ${lagText}`;
      const arrowSize = Math.max(12, Math.min(18, width * 3.1));
      return {
        source: group.nodeA,
        target: group.nodeB,
        _key: group.key,
        _labelText: labelText,
        lineStyle: { color, width, type: lineType, opacity: 0.86, curveness: group.direction === 'mixed' ? 0.1 : 0.14 },
        edgeSymbol: symbols,
        edgeSymbolSize: symbols[1] === 'arrow' ? [arrowSize, arrowSize] : [0, 0],
        emphasis: {
          lineStyle: { width: width + 1.2, opacity: 1 },
        },
      };
    });

    const legendData = [
      { color: 'hsla(200,80%,60%,0.85)', dash: false, label: 'Mostly positive effect' },
      { color: 'hsla(10,80%,60%,0.85)', dash: false, label: 'Mostly negative effect' },
      { color: 'rgba(120,139,174,0.58)', dash: false, label: 'Mixed directions' },
      { color: 'rgba(180,160,80,0.62)', dash: true, label: 'Undirected / uncertain' },
    ];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'item',
        enterable: true,
        confine: true,
        backgroundColor: 'rgba(14,18,32,0.95)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: '#e0e6f0', fontSize: 12 },
      },
      graphic: legendData.map((item, idx) => ({
        type: 'group',
        bottom: 14 + (legendData.length - 1 - idx) * 16,
        left: 14,
        children: [
          { type: 'line', shape: { x1: 0, y1: 0, x2: 22, y2: 0 }, style: { stroke: item.color, lineWidth: 2, lineDash: item.dash ? [5, 3] : undefined } },
          { type: 'text', left: 28, top: -6, style: { text: item.label, fill: '#788BAE', fontSize: 10 } },
        ],
      })),
      series: [
        {
          type: 'graph',
          layout: 'none',
          data: nodeData,
          links: edgeData,
          roam: true,
          draggable: true,
          symbol: 'circle',
          edgeLabel: {
            show: true,
            position: 'middle',
            distance: 14,
            color: '#dfe7f5',
            fontSize: groups.length > 8 ? 9 : 10,
            fontWeight: 600,
            backgroundColor: 'rgba(7, 10, 18, 0.96)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            borderRadius: 14,
            padding: [6, 10],
            formatter: (params: any) => String(params.data?._labelText || ''),
          },
          emphasis: { focus: 'adjacency' },
        },
      ],
    };
    chartInstance.setOption(option, true);
  };

  onMount(() => {
    if (chartContainer) {
      chartInstance = echarts.init(chartContainer, undefined, { renderer: 'canvas' });
      resizeObserver = new ResizeObserver(() => chartInstance?.resize());
      resizeObserver.observe(chartContainer);
      chartInstance.on('dblclick', (params: any) => {
        if (params.dataType !== 'node' || addEdgeMode()) return;
        const col = String(params.data?.id || '');
        if (!col) return;
        setEditPanel({ open: true, kind: 'node', nodeA: col });
      });
      chartInstance.on('contextmenu', (params: any) => {
        params.event.event.preventDefault();
        const x = params.event.event.clientX;
        const y = params.event.event.clientY;
        if (params.dataType === 'node') {
          setCtxMenu({ visible: true, x, y, kind: 'node', target: String(params.data.id) });
        } else if (params.dataType === 'edge' && typeof params.data?._key === 'string') {
          setCtxMenu({ visible: true, x, y, kind: 'edge', target: String(params.data._key) });
        }
      });
      chartInstance.on('click', (params: any) => {
        if (!addEdgeMode() || params.dataType !== 'node') return;
        const col = String(params.data?.id || '');
        if (!col) return;
        if (!addEdgeFirst()) {
          setAddEdgeFirst(col);
          uiStore.addToast({ message: `Add-edge: first node = ${col}. Click second node.`, type: 'info', duration: 4000 });
          return;
        }
        if (addEdgeFirst() === col) {
          uiStore.addToast({ message: 'Select a different second node.', type: 'warning', duration: 3000 });
          return;
        }
        const newLink: CausalLink = { source: addEdgeFirst()!, target: col, lag: 1, type: '-->', value: 0, pvalue: 0 };
        causalStore.setLinks([...causalStore.state.links, newLink]);
        setAddEdgeMode(false);
        setAddEdgeFirst(null);
        uiStore.addToast({ message: 'Edge added. Right-click to edit.', type: 'success', duration: 3000 });
        renderChart();
      });
      chartInstance.on('mouseup', (params: any) => {
        if (params.dataType === 'node' && params.data?.id) {
          const id = String(params.data.id);
          const x = Number(params.data.x);
          const y = Number(params.data.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            setNodePositions(prev => new Map(prev).set(id, { x, y }));
          }
        }
      });
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    chartInstance?.dispose();
  });

  createEffect(() => {
    selectedColumns();
    links();
    nodeLabels();
    chipColors();
    setTimeout(renderChart, 0);
  });

  const handleCloseCtxMenu = () => setCtxMenu(prev => ({ ...prev, visible: false }));
  const handleEditNode = (col: string) => { handleCloseCtxMenu(); setEditPanel({ open: true, kind: 'node', nodeA: col }); };
  const handleEditEdge = (key: string) => {
    handleCloseCtxMenu();
    const group = buildPairGroups().find(g => g.key === key);
    if (group) setEditPanel({ open: true, kind: 'edge', nodeA: group.nodeA, nodeB: group.nodeB, connections: [...group.connections] });
  };

  const handleConnectionChange = (idx: number, field: keyof CausalLink, value: string | number) => {
    setEditPanel(prev => {
      if (!prev.open || prev.kind !== 'edge' || !prev.connections) return prev;
      const updated = [...prev.connections];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, connections: updated };
    });
  };
  const handleDeleteNode = (col: string) => {
    // Capture positions before node is removed
    if (chartInstance) {
      const option = chartInstance.getOption() as { series?: Array<{ data?: unknown[] }> };
      const data = option?.series?.[0]?.data;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === 'object' && 'id' in item && 'x' in item && 'y' in item) {
            const record = item as { id: string; x: number; y: number };
            setNodePositions(prev => new Map(prev).set(record.id, { x: Number(record.x), y: Number(record.y) }));
          }
        }
      }
    }
    handleCloseCtxMenu();
    causalStore.setSelectedColumns(causalStore.state.selectedColumns.filter(c => c !== col));
    causalStore.setLinks(causalStore.state.links.filter(l => l.source !== col && l.target !== col));
    setNodeLabels(prev => { const m = new Map(prev); m.delete(col); return m; });
    renderChart();
  };
  const handleDeleteEdge = (key: string) => {
    handleCloseCtxMenu();
    causalStore.setLinks(causalStore.state.links.filter(l => {
      const k = l.source < l.target ? `${l.source}||${l.target}` : `${l.target}||${l.source}`;
      return k !== key;
    }));
    renderChart();
  };

  const handleApplyEdit = () => {
    const panel = editPanel();
    if (!panel.open) return;
    if (panel.kind === 'edge' && panel.connections) {
      causalStore.setLinks(panel.connections);
    }
    setEditPanel({ open: false, kind: 'node' });
    renderChart();
  };

  const handleSaveRun = () => {
    const name = `Run ${new Date().toLocaleTimeString()}`;
    causalStore.saveRun(name);
    uiStore.addToast({ message: `Run saved: ${name}`, type: 'success', duration: 3000 });
  };

  const handleExport = (format: 'json' | 'glm' | 'torch') => {
    setExportMenuOpen(false);
    const cols = causalStore.state.selectedColumns;
    const links_data = causalStore.state.links;
    let content = '';
    if (format === 'json') {
      const data = { nodes: cols, links: links_data, metadata: { tau_max: causalStore.state.tauMax, method: causalStore.state.method } };
      content = JSON.stringify(data, null, 2);
    } else if (format === 'glm') {
      const directed = links_data
        .filter((link) => link.source !== link.target)
        .filter((link) => link.type === '-->' || link.type === 'o->' || link.type === '<--' || link.type === '<-o');
      const byTarget = new Map<string, typeof directed>();
      cols.forEach(col => byTarget.set(col, []));
      directed.forEach(link => byTarget.get(link.target)?.push(link));
      const lines: string[] = [
        '# GLM-style formulas derived from directed causal links',
        `# tau_max = ${causalStore.state.tauMax}`,
        '',
      ];
      for (const [target, items] of byTarget) {
        if (items.length === 0) continue;
        const lhs = nodeLabels().get(target) || target;
        const rhs = items.map(link => `${nodeLabels().get(link.source) || link.source}_lag${link.lag}`).join(' + ');
        lines.push(`${lhs} ~ ${rhs}`);
      }
      content = lines.join('\n');
    } else {
      const nodeIndex: Record<string, number> = {};
      cols.forEach((col, idx) => { nodeIndex[col] = idx; });
      const groups = buildPairGroups();
      const edgeIndexA: number[] = [];
      const edgeIndexB: number[] = [];
      const edgeAttr: number[][] = [];
      groups.forEach(group => {
        edgeIndexA.push(nodeIndex[group.nodeA]);
        edgeIndexB.push(nodeIndex[group.nodeB]);
        edgeAttr.push([
          group.connections.length,
          group.lags.length ? Math.min(...group.lags) : 0,
          group.lags.length ? Math.max(...group.lags) : 0,
          group.meanValue,
          Number.isFinite(group.minPValue) ? group.minPValue : 1,
          group.direction === 'a_to_b' ? 1 : group.direction === 'b_to_a' ? 2 : 3,
        ]);
      });
      const nodeFeatures = cols.map((col) => ({
        index: nodeIndex[col],
        id: col,
        label: nodeLabels().get(col) || col,
      }));
      content = JSON.stringify({
        meta: {
          description: 'Aggregated pair-edge export for downstream graph modeling',
          edge_mode: 'one_edge_per_node_pair',
          tau_max: causalStore.state.tauMax,
          edge_attr_names: ['connection_count', 'min_lag', 'max_lag', 'mean_value', 'min_pvalue', 'direction_code'],
          direction_codes: { 0: 'mixed_or_unknown', 1: 'node_a_to_node_b', 2: 'node_b_to_node_a', 3: 'undirected_or_uncertain' },
        },
        node_features: nodeFeatures,
        edge_index: [edgeIndexA, edgeIndexB],
        edge_attr: edgeAttr,
        raw_links: links_data,
      }, null, 2);
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `causal_graph.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    uiStore.addToast({ message: `Exported as ${format.toUpperCase()}`, type: 'success', duration: 3000 });
  };

  const handleCompareRuns = () => {
    const a = compareRunA();
    const b = compareRunB();
    if (!a || !b) return;
    const runA = savedRuns().find(r => r.id === a);
    const runB = savedRuns().find(r => r.id === b);
    if (!runA || !runB) return;
    const aLinks = new Set(runA.links.map(l => `${l.source}->${l.target}`));
    const bLinks = new Set(runB.links.map(l => `${l.source}->${l.target}`));
    const added = runB.links.filter(l => !aLinks.has(`${l.source}->${l.target}`));
    const removed = runA.links.filter(l => !bLinks.has(`${l.source}->${l.target}`));
    setCompareResult({ added, removed });
    uiStore.addToast({ message: `Added: ${added.length}, Removed: ${removed.length}`, type: 'info', duration: 4000 });
  };

  return (
    <div class={styles.page}>
      <div class={styles.toolbar}>
        <div class={styles.toolbarGroup}>
          <label class={styles.toolbarLabel}>Method</label>
          <select
            class={styles.select}
            value={causalStore.state.method}
            onChange={e => causalStore.setMethod(e.currentTarget.value as CausalMethod)}
          >
            <For each={METHOD_OPTIONS}>{opt => <option value={opt.value}>{opt.label}</option>}</For>
          </select>
        </div>
        <div class={styles.toolbarGroup}>
          <label class={styles.toolbarLabel}>Test</label>
          <select
            class={styles.select}
            value={causalStore.state.test}
            onChange={e => causalStore.setTest(e.currentTarget.value as CausalTest)}
          >
            <For each={TEST_OPTIONS}>{opt => <option value={opt.value}>{opt.label}</option>}</For>
          </select>
        </div>
        <div class={styles.toolbarGroup}>
          <label class={styles.toolbarLabel}>τ max</label>
          <input
            type="number"
            class={styles.numberInput}
            min="1"
            max="10"
            value={causalStore.state.tauMax}
            onChange={e => causalStore.setTauMax(Number(e.currentTarget.value))}
          />
        </div>
        <div class={styles.toolbarGroup}>
          <label class={styles.toolbarLabel}>α</label>
          <input
            type="number"
            class={styles.numberInput}
            min="0.001"
            max="0.5"
            step="0.001"
            value={causalStore.state.alpha}
            onChange={e => causalStore.setAlpha(Number(e.currentTarget.value))}
          />
        </div>
        <Show when={usesPcStage()}>
          <div class={styles.toolbarGroup}>
            <label class={styles.toolbarLabel}>PC α</label>
            <input
              type="number"
              class={styles.numberInput}
              min="0.001"
              max="0.5"
              step="0.001"
              value={causalStore.state.pcAlpha}
              onChange={e => causalStore.setPcAlpha(Number(e.currentTarget.value))}
            />
          </div>
        </Show>
        <Show when={usesPcStage()}>
          <div class={styles.toolbarGroup}>
            <label class={styles.toolbarLabel}>Max conds</label>
            <input
              type="number"
              class={styles.numberInput}
              min="1"
              max="20"
              placeholder="auto"
              value={causalStore.state.maxCondsDim ?? ''}
              onChange={e => causalStore.setMaxCondsDim(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
            />
          </div>
        </Show>
        <div class={styles.toolbarGroup}>
          <label class={styles.toolbarLabel}>FDR</label>
          <select
            class={styles.select}
            value={causalStore.state.fdrMethod}
            onChange={e => causalStore.setFdrMethod(e.currentTarget.value as FdrMethod)}
          >
            <For each={FDR_OPTIONS}>{opt => <option value={opt.value}>{opt.label}</option>}</For>
          </select>
        </div>
        <div class={styles.toolbarGroupPush}>
          <button
            class={`${styles.btn} ${addEdgeMode() ? styles.btnAccent : styles.btnGhost}`}
            onClick={() => setAddEdgeMode(!addEdgeMode())}
          >
            {addEdgeMode() ? 'Cancel Edge' : '+ Edge'}
          </button>
          <div class={styles.exportWrapper}>
            <button class={styles.btnGhost} onClick={() => setExportMenuOpen(!exportMenuOpen())}>Export ▾</button>
            <Show when={exportMenuOpen()}>
              <div class={styles.exportMenu}>
                <button onClick={() => handleExport('json')}>JSON</button>
                <button onClick={() => handleExport('glm')}>GLM</button>
                <button onClick={() => handleExport('torch')}>PyTorch Geometric</button>
              </div>
            </Show>
          </div>
          <button class={styles.btnGhost} onClick={handleSaveRun}>Save Run</button>
          <button
            class={styles.btnAccent}
            onClick={fetchCausalGraph}
            disabled={loading() || numericCols().length === 0}
          >
            {loading() ? 'Computing...' : 'Compute'}
          </button>
        </div>
      </div>

      <div class={styles.columnBar}>
        <input
          type="text"
          class={styles.filterInput}
          placeholder="Filter columns..."
          value={columnFilter()}
          onInput={e => setColumnFilter(e.currentTarget.value)}
        />
        <ColumnChips
          columns={numericCols()}
          selected={selectedColumns()}
          filter={columnFilter()}
          onChange={handleColumnChange}
          colors={colorPalette()}
          onColorChange={handleColorChange}
        />
        <button class={styles.selectAllBtn} onClick={() => {
          if (selectedColumns().length === numericCols().length) {
            handleColumnChange([]);
          } else {
            handleColumnChange([...numericCols()]);
          }
        }}>
          {selectedColumns().length === numericCols().length ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <div class={styles.chartArea}>
        <Show when={!loading() && links().length === 0}>
          <div class={styles.emptyState}>
            <div class={styles.emptyIcon}>◎</div>
            <div class={styles.emptyTitle}>No causal graph computed</div>
            <div class={styles.emptyText}>Select columns and click Compute to discover causal relationships.</div>
          </div>
        </Show>
        <Show when={loading()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.spinner} />
            <div class={styles.loadingText}>Computing causal graph...</div>
          </div>
        </Show>
        <div ref={chartContainer} class={styles.chart} />
      </div>

      <Show when={ctxMenu().visible}>
        <div class={styles.ctxOverlay} onClick={handleCloseCtxMenu} />
        <div class={styles.ctxMenu} style={{ left: `${ctxMenu().x}px`, top: `${ctxMenu().y}px` }}>
          <Show when={ctxMenu().kind === 'node'}>
            <button onClick={() => handleEditNode(ctxMenu().target)}>Edit node</button>
            <button onClick={() => handleDeleteNode(ctxMenu().target)}>Delete node</button>
          </Show>
          <Show when={ctxMenu().kind === 'edge'}>
            <button onClick={() => handleEditEdge(ctxMenu().target)}>Edit edge</button>
            <button onClick={() => handleDeleteEdge(ctxMenu().target)}>Delete edge</button>
          </Show>
        </div>
      </Show>

      <Show when={editPanel().open}>
        <div class={styles.editPanel}>
          <div class={styles.editPanelHeader}>
            <span>{editPanel().kind === 'node' ? `Node: ${editPanel().nodeA}` : `Edge: ${editPanel().nodeA} ↔ ${editPanel().nodeB}`}</span>
            <button class={styles.closeBtn} onClick={() => setEditPanel(p => ({ ...p, open: false }))}>×</button>
          </div>
          <div class={styles.editPanelBody}>
            <Show when={editPanel().kind === 'node'}>
              <label class={styles.fieldRow}>
                <span>Label</span>
                <input type="text" class={styles.input} value={nodeLabels().get(editPanel().nodeA!) || editPanel().nodeA} onInput={e => setNodeLabels(prev => new Map(prev).set(editPanel().nodeA!, e.currentTarget.value))} />
              </label>
              <label class={styles.fieldRow}>
                <span>Color</span>
                <input type="color" class={styles.colorInput} value={chipColors().get(editPanel().nodeA!) || '#00a8ff'} onInput={e => setChipColors(prev => new Map(prev).set(editPanel().nodeA!, e.currentTarget.value))} />
              </label>
            </Show>
            <Show when={editPanel().kind === 'edge'}>
              <div class={styles.edgeStats}>
                <span class={styles.statPill}>{editPanel().connections?.length ?? 0} links</span>
                <span class={styles.statPill}>pmin {editPanel().connections?.reduce((m, c) => Math.min(m, c.pvalue), 1).toFixed(4) ?? 'n/a'}</span>
              </div>
              <div class={styles.connectionList}>
                <For each={editPanel().connections ?? []}>
                  {(conn, idx) => (
                    <div class={styles.connectionRow}>
                      <div class={styles.connectionHead}>
                        <span>{conn.source}</span>
                        <span class={styles.arrow}>→</span>
                        <span>{conn.target}</span>
                      </div>
                      <div class={styles.connectionFields}>
                        <label class={styles.fieldCol}>
                          <span>Lag</span>
                          <input type="number" class={styles.smallInput} value={conn.lag} min="0" step="1"
                            onInput={e => handleConnectionChange(idx(), 'lag', Number(e.currentTarget.value))} />
                        </label>
                        <label class={styles.fieldCol}>
                          <span>Type</span>
                          <select class={styles.smallSelect} value={conn.type}
                            onChange={e => handleConnectionChange(idx(), 'type', e.currentTarget.value)}>
                            <option value="-->">--&gt;</option>
                            <option value="o-&gt;">o-&gt;</option>
                            <option value="&lt;--">&lt;--</option>
                            <option value="&lt;-o">&lt;-o</option>
                            <option value="o-o">o-o</option>
                            <option value="x-x">x-x</option>
                            <option value="-?&gt;">-?&gt;</option>
                          </select>
                        </label>
                        <label class={styles.fieldCol}>
                          <span>Value</span>
                          <input type="number" class={styles.smallInput} value={conn.value} step="0.001"
                            onInput={e => handleConnectionChange(idx(), 'value', Number(e.currentTarget.value))} />
                        </label>
                        <label class={styles.fieldCol}>
                          <span>P-value</span>
                          <input type="number" class={styles.smallInput} value={conn.pvalue} min="0" step="0.0001"
                            onInput={e => handleConnectionChange(idx(), 'pvalue', Number(e.currentTarget.value))} />
                        </label>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
          <div class={styles.editPanelFooter}>
            <button class={styles.btnGhost} onClick={() => setEditPanel(p => ({ ...p, open: false }))}>Cancel</button>
            <button class={styles.btnAccent} onClick={handleApplyEdit}>Apply</button>
          </div>
        </div>
      </Show>

      <Show when={savedRuns().length > 0}>
        <div class={styles.comparePanel}>
          <div class={styles.compareHeader}>Run Comparison</div>
          <div class={styles.compareSelectors}>
            <select class={styles.select} onChange={e => causalStore.setCompareRunA(e.currentTarget.value || null)}>
              <option value="">Select run A</option>
              <For each={savedRuns()}>{run => <option value={run.id}>{run.name}</option>}</For>
            </select>
            <select class={styles.select} onChange={e => causalStore.setCompareRunB(e.currentTarget.value || null)}>
              <option value="">Select run B</option>
              <For each={savedRuns()}>{run => <option value={run.id}>{run.name}</option>}</For>
            </select>
            <button class={styles.btnAccent} onClick={handleCompareRuns} disabled={!compareRunA() || !compareRunB()}>Compare</button>
            <Show when={savedRuns().length > 0}>
              <span class={styles.toolbarLabel}>{savedRuns().length} saved run{savedRuns().length !== 1 ? 's' : ''}</span>
            </Show>
          </div>
          <Show when={compareResult()}>
            <div class={styles.compareResult}>
              <Show when={compareResult()!.added.length > 0}>
                <div class={styles.diffSection}>
                  <span class={styles.diffLabel}>Added ({compareResult()!.added.length}):</span>
                  <For each={compareResult()!.added}>{(link) => <span class={styles.diffItem}>{link.source} → {link.target} (τ{link.lag})</span>}</For>
                </div>
              </Show>
              <Show when={compareResult()!.removed.length > 0}>
                <div class={styles.diffSection}>
                  <span class={styles.diffLabel}>Removed ({compareResult()!.removed.length}):</span>
                  <For each={compareResult()!.removed}>{(link) => <span class={styles.diffItem}>{link.source} → {link.target} (τ{link.lag})</span>}</For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default CausalPage;