import { Component, JSX } from 'solid-js';
import { A } from '@solidjs/router';
import ToastContainer from '../ui/Toast';
import { uiStore } from '../../stores/uiStore';
import styles from './AppShell.module.css';

interface AppShellProps {
  children?: JSX.Element;
}

const navItems = [
  { path: '/', label: 'Home', symbol: '⌂' },
  { path: '/upload', label: 'Upload', symbol: '↑' },
  { path: '/timeseries', label: 'Timeseries', symbol: '〰' },
  { path: '/fft', label: 'FFT', symbol: '∿' },
  { path: '/heatmap', label: 'Heatmap', symbol: '▩' },
  { path: '/scatter', label: 'Scatter', symbol: '◌' },
  { path: '/drift', label: 'Drift', symbol: '↗' },
  { path: '/causal', label: 'Causal', symbol: '◎' },
  { path: '/settings', label: 'Settings', symbol: '⚙' },
];

const AppShell: Component<AppShellProps> = (props) => {
  return (
    <div class={styles.shell}>
      <aside class={`${styles.sidebar} ${!uiStore.state.sidebarOpen ? styles.collapsed : ''}`}>
        <button class={styles.toggle} onClick={() => uiStore.toggleSidebar()}>
          {uiStore.state.sidebarOpen ? '◀' : '▶'}
        </button>

        {!uiStore.state.sidebarOpen && <div class={styles.logo}>edatime</div>}

        <nav class={styles.nav}>
          {navItems.map((item) => (
            <A
              href={item.path}
              class={styles.navItem}
              activeClass={styles.active}
              end={true}
            >
              <span class={styles.symbol}>{item.symbol}</span>
              <span class={styles.label}>{item.label}</span>
            </A>
          ))}
        </nav>

        <div class={styles.footer}>
          {!uiStore.state.sidebarOpen && <span class={styles.version}>v0.1.0</span>}
        </div>
      </aside>
      <main class={styles.main}>
        {props.children}
      </main>
      <ToastContainer />
    </div>
  );
};

export default AppShell;