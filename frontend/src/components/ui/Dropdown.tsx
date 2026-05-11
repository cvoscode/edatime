import { Component, JSX, createSignal, Show, For } from 'solid-js';
import styles from './Dropdown.module.css';

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);

  const selectedLabel = () => {
    const found = props.options.find(o => o.value === props.value);
    return found ? found.label : props.placeholder ?? 'Select...';
  };

  return (
    <div class={`${styles.wrapper} ${props.class ?? ''}`}>
      <button
        type="button"
        class={styles.trigger}
        onClick={() => setIsOpen(!isOpen())}
        aria-expanded={isOpen()}
      >
        <span class={styles.value}>{selectedLabel()}</span>
        <span class={styles.chevron}>▼</span>
      </button>
      <Show when={isOpen()}>
        <div class={styles.menu}>
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                class={`${styles.option} ${option.value === props.value ? styles.selected : ''}`}
                onClick={() => {
                  props.onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default Dropdown;