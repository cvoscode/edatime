import { Component, createSignal, createEffect, For, Show } from 'solid-js';
import { chartStore } from '../../stores';
import styles from './LabelsDrawer.module.css';

interface LabelsDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  onChange: (title: string, xAxisLabel: string, yAxisLabel: string) => void;
  engineName?: string;
}

const LabelsDrawer: Component<LabelsDrawerProps> = (props) => {
  const [localTitle, setLocalTitle] = createSignal('');
  const [localXAxisLabel, setLocalXAxisLabel] = createSignal('');
  const [localYAxisLabel, setLocalYAxisLabel] = createSignal('');
  const [activeTab, setActiveTab] = createSignal<'labels' | 'annotations'>('labels');
  const [annTitle, setAnnTitle] = createSignal('');
  const [annType, setAnnType] = createSignal<'bookmark' | 'region'>('bookmark');
  const [annColor, setAnnColor] = createSignal('#ffc041');
  const [annStart, setAnnStart] = createSignal('');
  const [annEnd, setAnnEnd] = createSignal('');

  createEffect(() => {
    if (props.open) {
      setLocalTitle(props.title);
      setLocalXAxisLabel(props.xAxisLabel);
      setLocalYAxisLabel(props.yAxisLabel);
    }
  });

  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    props.onChange(value, localXAxisLabel(), localYAxisLabel());
  };

  const handleXAxisChange = (value: string) => {
    setLocalXAxisLabel(value);
    props.onChange(localTitle(), value, localYAxisLabel());
  };

  const handleYAxisChange = (value: string) => {
    setLocalYAxisLabel(value);
    props.onChange(localTitle(), localXAxisLabel(), value);
  };

  const handleAddAnnotation = () => {
    if (!annTitle()) return;
    const start = annStart() ? new Date(annStart()).getTime() : Date.now();
    const end = annEnd() ? new Date(annEnd()).getTime() : start;
    chartStore.addAnnotation({
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: annType(),
      title: annTitle(),
      color: annColor(),
      timeRange: { start, end },
    });
    setAnnTitle('');
    setAnnStart('');
    setAnnEnd('');
  };

  const handleDeleteAnnotation = (id: string) => {
    chartStore.removeAnnotation(id);
  };

  return (
    <div class={styles.drawer} classList={{ [styles.open]: props.open }}>
      <div class={styles.header}>
        <span class={styles.title}>Chart Labels</span>
        <button class={styles.closeBtn} onClick={props.onClose} aria-label="Close">×</button>
      </div>
      <div class={styles.tabBar}>
        <button class={`${styles.tabBtn} ${activeTab() === 'labels' ? styles.activeTab : ''}`} onClick={() => setActiveTab('labels')}>Labels</button>
        <button class={`${styles.tabBtn} ${activeTab() === 'annotations' ? styles.activeTab : ''}`} onClick={() => setActiveTab('annotations')}>Annotations</button>
      </div>
      <div class={styles.body}>
        <Show when={activeTab() === 'labels'}>
          <div class={styles.section}>
            <div class={styles.sectionTitle}>Axis Labels</div>
            <div class={styles.field}>
              <label for="x-axis-label-input">X-Axis</label>
              <input
                type="text"
                id="x-axis-label-input"
                value={localXAxisLabel()}
                onInput={(e) => handleXAxisChange(e.currentTarget.value)}
                placeholder="X-axis label"
              />
            </div>
            <div class={styles.field}>
              <label for="y-axis-label-input">Y-Axis</label>
              <input
                type="text"
                id="y-axis-label-input"
                value={localYAxisLabel()}
                onInput={(e) => handleYAxisChange(e.currentTarget.value)}
                placeholder="Y-axis label"
              />
            </div>
          </div>

          <div class={styles.section}>
            <div class={styles.sectionTitle}>Title</div>
            <div class={styles.field}>
              <label for="chart-title-input">Chart Title</label>
              <input
                type="text"
                id="chart-title-input"
                value={localTitle()}
                onInput={(e) => handleTitleChange(e.currentTarget.value)}
                placeholder="Chart title"
              />
            </div>
            {props.engineName === 'ChartGPU' && (
              <div class={styles.hint}>
                Title is not supported in WebGPU mode. Axis labels are supported.
              </div>
            )}
          </div>
        </Show>

        <Show when={activeTab() === 'annotations'}>
          <div class={styles.section}>
            <div class={styles.sectionTitle}>Add Annotation</div>
            <div class={styles.field}>
              <label for="ann-title-input">Title</label>
              <input type="text" id="ann-title-input" value={annTitle()} onInput={(e) => setAnnTitle(e.currentTarget.value)} placeholder="Annotation title" />
            </div>
            <div class={styles.field}>
              <label for="ann-type-select">Type</label>
              <select id="ann-type-select" class={styles.select} value={annType()} onChange={(e) => setAnnType(e.currentTarget.value as 'bookmark' | 'region')}>
                <option value="bookmark">Bookmark (point in time)</option>
                <option value="region">Region (time range)</option>
              </select>
            </div>
            <div class={styles.field}>
              <label for="ann-color-input">Color</label>
              <input type="color" id="ann-color-input" value={annColor()} onInput={(e) => setAnnColor(e.currentTarget.value)} />
            </div>
            <div class={styles.field}>
              <label for="ann-start-input">Start</label>
              <input type="datetime-local" id="ann-start-input" class={styles.input} value={annStart()} onInput={(e) => setAnnStart(e.currentTarget.value)} />
            </div>
            <Show when={annType() === 'region'}>
              <div class={styles.field}>
                <label for="ann-end-input">End</label>
                <input type="datetime-local" id="ann-end-input" class={styles.input} value={annEnd()} onInput={(e) => setAnnEnd(e.currentTarget.value)} />
              </div>
            </Show>
            <button class={styles.addBtn} onClick={handleAddAnnotation} disabled={!annTitle()}>Add Annotation</button>
          </div>

          <div class={styles.section}>
            <div class={styles.sectionTitle}>Existing Annotations</div>
            <div class={styles.annList}>
              <For each={chartStore.state.annotations}>
                {(ann) => (
                  <div class={styles.annItem}>
                    <span class={styles.annBadge} style={{ background: ann.color }} />
                    <span class={styles.annLabel}>{ann.title}</span>
                    <span class={styles.annType}>{ann.type}</span>
                    <button class={styles.deleteBtn} onClick={() => handleDeleteAnnotation(ann.id)} aria-label="Delete annotation">×</button>
                  </div>
                )}
              </For>
              <Show when={chartStore.state.annotations.length === 0}>
                <div class={styles.emptyHint}>No annotations yet</div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default LabelsDrawer;