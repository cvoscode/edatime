/**
 * AppShell - root application layout shell with sidebar navigation.
 *
 * Renders: sidebar (collapsible) + main content area + toast notifications.
 *
 * Sidebar state (open/collapsed) lives in uiStore and persists to localStorage.
 *
 * @example
 * <AppShell>
 *   <MyPageContent />
 * </AppShell>
 */
import { Component, JSX, Show } from 'solid-js';
import { A } from '@solidjs/router';
import ToastContainer from '../ui/Toast';
import { uiStore } from '@/stores/uiStore';
import styles from './AppShell.module.css';

interface AppShellProps {
    /** Page content - rendered in the main area */
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

export const AppShell: Component<AppShellProps> = (props) => {
    return (
        <div class={styles.shell}>
            {/* Collapsible sidebar */}
            <aside class={`${styles.sidebar} ${!uiStore.state.sidebarOpen ? styles.collapsed : ''}`}>
                <header class={styles.header}>
                    <div class={styles.headerTop}>
                        <A href="/" class={styles.logoRow}>
                            <img src="/logo.svg" alt="edatime" class={styles.logoImg} />
                        </A>
                        <button
                            class={styles.toggle}
                            onClick={() => uiStore.toggleSidebar()}
                            aria-label={uiStore.state.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                            type="button"
                        >
                            {uiStore.state.sidebarOpen ? '◀' : '▶'}
                        </button>
                    </div>
                </header>

                <nav class={styles.nav} aria-label="Main navigation">
                    {navItems.map((item) => (
                        <A
                            href={item.path}
                            class={styles.navItem}
                            activeClass={styles.active}
                            end={true}
                        >
                            <span class={styles.symbol}>{item.symbol}</span>
                            <Show when={uiStore.state.sidebarOpen}>
                                <span class={styles.label}>{item.label}</span>
                            </Show>
                        </A>
                    ))}
                </nav>

                <div class={styles.footer}>
                    <Show when={!uiStore.state.sidebarOpen}>
                        <span class={styles.version}>v0.1.0</span>
                    </Show>
                </div>
            </aside>

            {/* Main content area */}
            <main class={styles.main}>
                {props.children}
            </main>

            {/* Toast notifications - rendered once at root */}
            <ToastContainer />
        </div>
    );
};

export default AppShell;
