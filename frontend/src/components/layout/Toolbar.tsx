import { Component, JSX } from 'solid-js';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  left?: JSX.Element;
  center?: JSX.Element;
  right?: JSX.Element;
}

const Toolbar: Component<ToolbarProps> = (props) => {
  return (
    <div class={styles.toolbar}>
      {props.left && <div class={styles.left}>{props.left}</div>}
      {props.center && <div class={styles.center}>{props.center}</div>}
      {props.right && <div class={styles.right}>{props.right}</div>}
    </div>
  );
};

export default Toolbar;