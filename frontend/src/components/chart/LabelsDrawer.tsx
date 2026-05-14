import { Component, createSignal, createEffect } from 'solid-js';
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

  return (
    <div class={styles.drawer} classList={{ [styles.open]: props.open }}>
      <div class={styles.header}>
        <span class={styles.title}>Chart Labels</span>
        <button class={styles.closeBtn} onClick={props.onClose} aria-label="Close">×</button>
      </div>
      <div class={styles.body}>
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
      </div>
    </div>
  );
};

export default LabelsDrawer;