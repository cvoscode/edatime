import { Component, JSX } from 'solid-js';
import styles from './PageContainer.module.css';

interface PageContainerProps {
  title?: string;
  children: JSX.Element;
  actions?: JSX.Element;
}

const PageContainer: Component<PageContainerProps> = (props) => {
  return (
    <div class={styles.container}>
      {props.title && (
        <header class={styles.header}>
          <h1 class={styles.title}>{props.title}</h1>
          {props.actions && <div class={styles.actions}>{props.actions}</div>}
        </header>
      )}
      <div class={styles.content}>
        {props.children}
      </div>
    </div>
  );
};

export default PageContainer;