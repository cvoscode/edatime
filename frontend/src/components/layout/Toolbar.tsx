import { Component } from 'solid-js';
import { Button } from '../ui';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  onExport?: () => void;
  drawMode?: 'pan' | 'zoom' | 'select';
  onDrawModeChange?: (mode: 'pan' | 'zoom' | 'select') => void;
}

const Toolbar: Component<ToolbarProps> = (props) => {
  return (
    <div class={styles.toolbar}>
      <div class={styles.group}>
        <Button variant="ghost" size="sm" onClick={props.onZoomIn} title="Zoom In">+</Button>
        <Button variant="ghost" size="sm" onClick={props.onZoomOut} title="Zoom Out">−</Button>
        <Button variant="ghost" size="sm" onClick={props.onReset} title="Reset Zoom">⟲</Button>
      </div>

      <div class={styles.divider} />

      <div class={styles.group}>
        <Button
          variant={props.drawMode === 'pan' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => props.onDrawModeChange?.('pan')}
          title="Pan"
        >
          ✋
        </Button>
        <Button
          variant={props.drawMode === 'zoom' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => props.onDrawModeChange?.('zoom')}
          title="Zoom Rectangle"
        >
          🔍
        </Button>
        <Button
          variant={props.drawMode === 'select' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => props.onDrawModeChange?.('select')}
          title="Select Region"
        >
          ▢
        </Button>
      </div>

      <div class={styles.divider} />

      <div class={styles.group}>
        <Button variant="ghost" size="sm" onClick={props.onExport} title="Export">
          ↓ Export
        </Button>
      </div>
    </div>
  );
};

export default Toolbar;