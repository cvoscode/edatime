import { Component } from 'solid-js';
import styles from './Chip.module.css';

interface ChipProps {
  label: string;
  color?: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

const Chip: Component<ChipProps> = (props) => {
  return (
    <button
      class={`${styles.chip} ${props.selected ? styles.selected : ''}`}
      onClick={props.onClick}
      style={props.color ? { '--chip-color': props.color } : undefined}
    >
      <span class={styles.dot} style={{ background: props.color }} />
      <span class={styles.label}>{props.label}</span>
      {props.onRemove && (
        <span class={styles.remove} onClick={(e) => { e.stopPropagation(); props.onRemove?.(); }}>×</span>
      )}
    </button>
  );
};

export default Chip;