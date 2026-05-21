/**
 * Dropdown — headless simple dropdown with basic open/close state.
 *
 * State: isOpen is local signal (no external control).
 * For controlled usage (open state from parent), use Select instead.
 *
 * @example
 * <Dropdown
 *   options={[
 *     { value: 'export-csv', label: 'Export CSV' },
 *     { value: 'export-png', label: 'Export PNG' },
 *   ]}
 *   value={action()}
 *   onChange={setAction}
 * />
 */
import { Component, createSignal, Show, For } from 'solid-js';
import styles from './Dropdown.module.css';

export interface DropdownOption {
    value: string;
    label: string;
}

export interface DropdownProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    class?: string;
}

export const Dropdown: Component<DropdownProps> = (props) => {
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
                aria-haspopup="listbox"
            >
                <span class={styles.value}>{selectedLabel()}</span>
                <span class={styles.chevron}>▼</span>
            </button>
            <Show when={isOpen()}>
                <div class={styles.menu} role="listbox">
                    <For each={props.options}>
                        {(option) => (
                            <button
                                type="button"
                                class={`${styles.option} ${option.value === props.value ? styles.selected : ''}`}
                                onClick={() => {
                                    props.onChange(option.value);
                                    setIsOpen(false);
                                }}
                                role="option"
                                aria-selected={option.value === props.value}
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