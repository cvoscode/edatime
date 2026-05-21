/**
 * Select — headless accessible select/dropdown with keyboard navigation.
 *
 * State:
 * - isOpen: local signal (opened/closed only)
 * - highlightedIndex: local signal (keyboard navigation cursor)
 *
 * Exports:
 * - SelectOption interface (value/label/disabled)
 * - SelectProps interface
 *
 * No internal state for selected value — controlled via props.value + onChange.
 *
 * @example
 * <Select
 *   options={[
 *     { value: 'a', label: 'Option A' },
 *     { value: 'b', label: 'Option B', disabled: true },
 *   ]}
 *   value={selected()}
 *   onChange={setSelected}
 *   placeholder="Choose one..."
 * />
 */
import { Component, createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import styles from './Select.module.css';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    class?: string;
    disabled?: boolean;
}

export const Select: Component<SelectProps> = (props) => {
    const [isOpen, setIsOpen] = createSignal(false);
    const [highlightedIndex, setHighlightedIndex] = createSignal(0);
    let containerRef: HTMLDivElement | undefined;

    const selectedOption = () => props.options.find(o => o.value === props.value);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (props.disabled) return;

        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (isOpen()) {
                    const opt = props.options[highlightedIndex()];
                    if (opt && !opt.disabled) {
                        props.onChange(opt.value);
                        setIsOpen(false);
                    }
                } else {
                    setIsOpen(true);
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (!isOpen()) {
                    setIsOpen(true);
                } else {
                    setHighlightedIndex(i => Math.min(i + 1, props.options.length - 1));
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (isOpen()) {
                    setHighlightedIndex(i => Math.max(i - 1, 0));
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    // Sync highlighted index when value changes externally
    createEffect(() => {
        if (isOpen()) {
            const idx = props.options.findIndex(o => o.value === props.value);
            if (idx >= 0) setHighlightedIndex(idx);
        }
    });

    // Close on outside click
    createEffect(() => {
        if (isOpen()) {
            const handleClickOutside = (e: MouseEvent) => {
                if (containerRef && !containerRef.contains(e.target as Node)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));
        }
    });

    return (
        <div
            ref={containerRef}
            class={`${styles.wrapper} ${props.class ?? ''} ${props.disabled ? styles.disabled : ''}`}
        >
            <button
                type="button"
                class={styles.trigger}
                classList={{ [styles.open]: isOpen() }}
                onClick={() => !props.disabled && setIsOpen(!isOpen())}
                onKeyDown={handleKeyDown}
                aria-expanded={isOpen()}
                aria-haspopup="listbox"
                disabled={props.disabled}
            >
                <span class={styles.value}>
                    {selectedOption()?.label ?? props.placeholder ?? 'Select...'}
                </span>
                <span class={styles.chevron}>▼</span>
            </button>

            <Show when={isOpen()}>
                <div class={styles.menu} role="listbox">
                    <For each={props.options}>
                        {(option, idx) => (
                            <button
                                type="button"
                                class={styles.option}
                                classList={{
                                    [styles.selected]: option.value === props.value,
                                    [styles.highlighted]: idx() === highlightedIndex(),
                                    [styles.optionDisabled]: option.disabled,
                                }}
                                onClick={() => {
                                    if (!option.disabled) {
                                        props.onChange(option.value);
                                        setIsOpen(false);
                                    }
                                }}
                                onMouseEnter={() => setHighlightedIndex(idx())}
                                disabled={option.disabled}
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

export default Select;