import { Component, For, JSX, createSignal, Show } from 'solid-js';
import styles from './Tabs.module.css';

interface Tab {
  id: string;
  label: string;
  icon?: JSX.Element;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const Tabs: Component<TabsProps> = (props) => {
  return (
    <div class={styles.tabs}>
      <For each={props.tabs}>
        {(tab) => (
          <button
            class={`${styles.tab} ${props.activeTab === tab.id ? styles.active : ''}`}
            onClick={() => props.onTabChange(tab.id)}
            type="button"
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