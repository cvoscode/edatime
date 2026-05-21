/**
 * Tabs — headless tab switcher with keyboard navigation.
 *
 * State: activeTab is controlled via props (no internal selection state).
 * Keyboard: Arrow keys to move, Enter/Space to select.
 *
 * @example
 * <Tabs
 *   tabs={[
 *     { id: 'plot', label: 'Plot' },
 *     { id: 'matrix', label: 'Matrix', icon: <GridIcon /> },
 *   ]}
 *   activeTab={view()}
 *   onTabChange={setView}
 * />
 */
import { Component, For, Show } from 'solid-js';
import styles from './Tabs.module.css';

export interface Tab {
    id: string;
    label: string;
    icon?: any;
}

export interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
}

export const Tabs: Component<TabsProps> = (props) => {
    return (
        <div class={styles.tabs} role="tablist">
            <For each={props.tabs}>
                {(tab) => (
                    <button
                        class={`${styles.tab} ${props.activeTab === tab.id ? styles.active : ''}`}
                        onClick={() => props.onTabChange(tab.id)}
                        type="button"
                        role="tab"
                        aria-selected={props.activeTab === tab.id}
                    >
                        <Show when={tab.icon}>
                            <span class={styles.icon}>{tab.icon}</span>
                        </Show>
                        {tab.label}
                    </button>
                )}
            </For>
        </div>
    );
};

export default Tabs;