import { Component, JSX, createSignal, Show } from 'solid-js';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string | JSX.Element;
  children: JSX.Element;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: Component<TooltipProps> = (props) => {
  const [visible, setVisible] = createSignal(false);
  const pos = () => props.position ?? 'top';

  return (
    <div
      class={styles.wrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {props.children}
      <Show when={visible()}>
        <div class={`${styles.tooltip} ${styles[pos()]}`}>
          {props.content}
        </div>
      </Show>
    </div>
  );
};

export default Tooltip;