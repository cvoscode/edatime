import { Component } from 'solid-js';
import styles from './PlaceholderPage.module.css';

interface Props {
  title: string;
}

const PlaceholderPage: Component<Props> = (props) => (
  <div class={styles.page}>
    <h1 class={styles.title}>{props.title}</h1>
    <p class={styles.placeholder}>Page not yet migrated</p>
  </div>
);

export default PlaceholderPage;