import { Component } from 'solid-js';
import { Button, Input } from '../components/ui';
import { uiStore } from '../stores';
import styles from './SettingsPage.module.css';

const SettingsPage: Component = () => {
  return (
    <div class={styles.page}>
      <h1 class={styles.title}>Settings</h1>
      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>Theme</h2>
        <div class={styles.themeButtons}>
          <Button
            variant={uiStore.state.theme === 'dark' ? 'primary' : 'secondary'}
            onClick={() => uiStore.setTheme('dark')}
          >
            Dark
          </Button>
          <Button
            variant={uiStore.state.theme === 'light' ? 'primary' : 'secondary'}
            onClick={() => uiStore.setTheme('light')}
          >
            Light
          </Button>
          <Button
            variant={uiStore.state.theme === 'system' ? 'primary' : 'secondary'}
            onClick={() => uiStore.setTheme('system')}
          >
            System
          </Button>
        </div>
      </div>
      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>About</h2>
        <p class={styles.about}>edatime v0.1.0</p>
        <p class={styles.about}>Analytics for time series data</p>
      </div>
    </div>
  );
};

export default SettingsPage;