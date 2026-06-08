export interface DropdownOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface DropdownSetOptionsConfig {
    preferredValue?: string | null;
    emitChange?: boolean;
}

export interface DropdownChangeDetail {
    value: string;
}

export interface DropdownProps {
    id?: string;
    name?: string;
    label: string;
    value?: string;
    options: DropdownOption[];
    className?: string;
    disabled?: boolean;
    variant?: 'default' | 'compact' | 'chip';
    onChange?: (value: string) => void;
}

export interface DropdownController {
    root: HTMLDivElement;
    trigger: HTMLButtonElement;
    menu: HTMLDivElement;
    getValue(): string;
    setValue(value: string, options?: { emitChange?: boolean }): void;
    getOptions(): Array<Required<DropdownOption>>;
    setOptions(options: DropdownOption[], config?: DropdownSetOptionsConfig): string;
    setDisabled(disabled: boolean): void;
    focus(): void;
    open(): void;
    close(): void;
    destroy(): void;
}

const dropdownRegistry = new Map<string, DropdownController>();
let instanceCounter = 0;

function normalizeOptions(options: DropdownOption[]): Array<Required<DropdownOption>> {
    return options.map((option) => ({
        value: String(option.value ?? ''),
        label: String(option.label ?? option.value ?? ''),
        disabled: !!option.disabled,
    }));
}

function findFirstEnabledOption(options: Array<Required<DropdownOption>>): Required<DropdownOption> | null {
    return options.find((option) => !option.disabled) ?? null;
}

function findSelectedOption(options: Array<Required<DropdownOption>>, value: string): Required<DropdownOption> | null {
    return options.find((option) => option.value === value) ?? null;
}

function isHtmlSelectElement(element: Element | null): element is HTMLSelectElement {
    return !!element && element instanceof HTMLSelectElement;
}

function dropdownRootForElement(element: Element | null): HTMLElement | null {
    if (!element) return null;
    if (element instanceof HTMLElement && element.classList.contains('dropdown')) return element;
    return element instanceof HTMLElement ? element.closest('.dropdown') as HTMLElement | null : null;
}

function dispatchDropdownChange(root: HTMLElement, value: string): void {
    root.dispatchEvent(new CustomEvent<DropdownChangeDetail>('dropdown:change', {
        bubbles: true,
        detail: { value },
    }));
    root.dispatchEvent(new Event('change', { bubbles: true }));
    root.dispatchEvent(new Event('input', { bubbles: true }));
}

export function createDropdown(props: DropdownProps): DropdownController {
    const instanceId = props.id || `dropdown-${++instanceCounter}`;
    const listboxId = `${instanceId}__listbox`;
    const root = document.createElement('div');
    root.className = `dropdown dropdown--${props.variant ?? 'default'}${props.className ? ` ${props.className}` : ''}`;
    root.id = instanceId;
    root.tabIndex = -1;
    root.dataset.dropdownId = instanceId;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown__trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', listboxId);
    trigger.setAttribute('aria-label', props.label);

    const label = document.createElement('span');
    label.className = 'dropdown__label';
    const chevron = document.createElement('span');
    chevron.className = 'dropdown__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>';
    trigger.append(label, chevron);

    const menu = document.createElement('div');
    menu.className = 'dropdown__menu';
    menu.id = listboxId;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    root.append(trigger, menu);

    let options = normalizeOptions(props.options);
    let value = props.value ?? '';
    let open = false;
    let destroyed = false;
    let activeIndex = -1;
    let typeaheadBuffer = '';
    let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;

    const syncTriggerLabel = () => {
        const selected = findSelectedOption(options, value) ?? findFirstEnabledOption(options);
        label.textContent = selected?.label ?? '';
    };

    const syncActiveState = () => {
        const optionEls = menu.querySelectorAll<HTMLButtonElement>('.dropdown__option');
        optionEls.forEach((optionEl, index) => {
            const option = options[index];
            const isSelected = option?.value === value;
            const isActive = index === activeIndex;
            optionEl.setAttribute('aria-selected', String(isSelected));
            optionEl.classList.toggle('is-selected', isSelected);
            optionEl.classList.toggle('is-active', isActive);
        });
    };

    const renderOptions = () => {
        menu.innerHTML = '';
        options.forEach((option, index) => {
            const optionEl = document.createElement('button');
            optionEl.type = 'button';
            optionEl.className = 'dropdown__option';
            optionEl.dataset.value = option.value;
            optionEl.setAttribute('role', 'option');
            optionEl.disabled = option.disabled;
            optionEl.textContent = option.label;
            optionEl.addEventListener('click', () => {
                controller.setValue(option.value, { emitChange: true });
                controller.close();
                trigger.focus();
            });
            menu.appendChild(optionEl);
            if (option.value === value && activeIndex < 0) activeIndex = index;
        });
        syncActiveState();
    };

    const focusIndex = (nextIndex: number) => {
        if (options.length === 0) {
            activeIndex = -1;
            syncActiveState();
            return;
        }
        let candidate = nextIndex;
        for (let attempts = 0; attempts < options.length; attempts += 1) {
            const wrapped = (candidate + options.length) % options.length;
            if (!options[wrapped]?.disabled) {
                activeIndex = wrapped;
                syncActiveState();
                return;
            }
            candidate += 1;
        }
    };

    const openMenu = () => {
        if (open || trigger.disabled) return;
        open = true;
        root.classList.add('dropdown--open');
        trigger.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
        focusIndex(selectedIndex >= 0 ? selectedIndex : 0);
    };

    const closeMenu = () => {
        if (!open) return;
        open = false;
        root.classList.remove('dropdown--open');
        trigger.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        activeIndex = -1;
        syncActiveState();
    };

    const chooseActiveOption = () => {
        const option = options[activeIndex];
        if (!option || option.disabled) return;
        controller.setValue(option.value, { emitChange: true });
        closeMenu();
        trigger.focus();
    };

    const handleTypeahead = (key: string) => {
        if (key.length !== 1 || key.trim().length === 0) return false;
        typeaheadBuffer += key.toLowerCase();
        if (typeaheadTimer !== null) clearTimeout(typeaheadTimer);
        typeaheadTimer = setTimeout(() => {
            typeaheadBuffer = '';
            typeaheadTimer = null;
        }, 250);
        const matchIndex = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typeaheadBuffer));
        if (matchIndex >= 0) {
            if (!open) openMenu();
            focusIndex(matchIndex);
            return true;
        }
        return false;
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (trigger.disabled) return;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!open) openMenu();
                else focusIndex(activeIndex + 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (!open) openMenu();
                else focusIndex(activeIndex - 1);
                break;
            case 'Home':
                if (!open) return;
                event.preventDefault();
                focusIndex(0);
                break;
            case 'End':
                if (!open) return;
                event.preventDefault();
                focusIndex(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (!open) openMenu();
                else chooseActiveOption();
                break;
            case 'Escape':
                if (!open) return;
                event.preventDefault();
                closeMenu();
                trigger.focus();
                break;
            default:
                handleTypeahead(event.key);
                break;
        }
    };

    const handleDocumentPointerDown = (event: MouseEvent) => {
        if (!open) return;
        const target = event.target as Node | null;
        if (target && root.contains(target)) return;
        closeMenu();
    };

    trigger.addEventListener('click', () => {
        if (open) closeMenu();
        else openMenu();
    });
    trigger.addEventListener('keydown', (event) => {
        handleKeydown(event);
        event.stopPropagation();
    });
    root.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousedown', handleDocumentPointerDown);

    const controller: DropdownController = {
        root,
        trigger,
        menu,
        getValue: () => value,
        setValue: (nextValue, optionsConfig = {}) => {
            const selected = findSelectedOption(options, String(nextValue));
            const next = selected?.disabled ? null : selected;
            if (!next) return;
            const changed = value !== next.value;
            value = next.value;
            syncTriggerLabel();
            syncActiveState();
            if (changed && optionsConfig.emitChange) {
                props.onChange?.(value);
                dispatchDropdownChange(root, value);
            }
        },
        getOptions: () => [...options],
        setOptions: (nextOptions, config = {}) => {
            options = normalizeOptions(nextOptions);
            const preferred = config.preferredValue ?? value;
            const selected = findSelectedOption(options, preferred || '')
                ?? findFirstEnabledOption(options);
            const previous = value;
            value = selected?.value ?? '';
            activeIndex = options.findIndex((option) => option.value === value);
            renderOptions();
            syncTriggerLabel();
            if (config.emitChange && previous !== value) {
                props.onChange?.(value);
                dispatchDropdownChange(root, value);
            }
            return value;
        },
        setDisabled: (disabled) => {
            trigger.disabled = !!disabled;
            root.classList.toggle('dropdown--disabled', !!disabled);
            if (disabled) closeMenu();
        },
        focus: () => trigger.focus(),
        open: openMenu,
        close: closeMenu,
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            document.removeEventListener('mousedown', handleDocumentPointerDown);
            if (dropdownRegistry.get(instanceId) === controller) {
                dropdownRegistry.delete(instanceId);
            }
        },
    };

    controller.setOptions(options);
    controller.setDisabled(!!props.disabled);
    if (props.id) dropdownRegistry.set(props.id, controller);
    return controller;
}

export function getDropdownController(id: string): DropdownController | null {
    return dropdownRegistry.get(id) ?? null;
}

export function upgradeSelectElement(selectEl: HTMLSelectElement): DropdownController {
    const style = selectEl.getAttribute('style');
    const options = Array.from(selectEl.options).map((option) => ({
        value: option.value,
        label: option.textContent || option.label || option.value,
        disabled: option.disabled,
    }));
    const controller = createDropdown({
        id: selectEl.id || undefined,
        name: selectEl.name || undefined,
        label: selectEl.getAttribute('aria-label') || selectEl.name || selectEl.id || 'Dropdown',
        value: selectEl.value,
        options,
        className: selectEl.className || undefined,
        disabled: selectEl.disabled,
        variant: selectEl.classList.contains('ctrl-sm')
            || selectEl.closest('.toolbar, .scatter-toolbar')
            ? 'compact'
            : selectEl.id === 'color-column-select'
                ? 'chip'
                : 'default',
    });
    for (const attribute of Array.from(selectEl.attributes)) {
        if (['id', 'class', 'style', 'aria-label', 'disabled'].includes(attribute.name)) continue;
        controller.root.setAttribute(attribute.name, attribute.value);
    }
    if (style) controller.root.setAttribute('style', style);
    selectEl.replaceWith(controller.root);
    return controller;
}

export function upgradeSelects(root: ParentNode = document): DropdownController[] {
    const selectEls = Array.from(root.querySelectorAll('select'))
        .filter((selectEl) => !selectEl.multiple && !selectEl.hasAttribute('data-dropdown-skip'));
    return selectEls.map((selectEl) => upgradeSelectElement(selectEl));
}

export function getDropdownValue(id: string): string {
    const controller = getDropdownController(id);
    if (controller) return controller.getValue();
    const element = document.getElementById(id);
    return isHtmlSelectElement(element) ? element.value : '';
}

export function getDropdownValueFromElement(element: Element | null): string {
    if (isHtmlSelectElement(element)) return element.value;
    const root = dropdownRootForElement(element);
    if (!root?.id) return '';
    return getDropdownValue(root.id);
}

export function getDropdownOptions(id: string): Array<Required<DropdownOption>> {
    const controller = getDropdownController(id);
    if (controller) return controller.getOptions();
    const element = document.getElementById(id);
    if (!isHtmlSelectElement(element)) return [];
    return Array.from(element.options).map((option) => ({
        value: option.value,
        label: option.textContent || option.label || option.value,
        disabled: option.disabled,
    }));
}

export function setDropdownValue(id: string, value: string, options?: { emitChange?: boolean }): void {
    const controller = getDropdownController(id);
    if (controller) {
        controller.setValue(value, options);
        return;
    }
    const element = document.getElementById(id);
    if (!isHtmlSelectElement(element)) return;
    const changed = element.value !== value;
    element.value = value;
    if (changed && options?.emitChange) element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setDropdownValueForElement(element: Element | null, value: string, options?: { emitChange?: boolean }): void {
    if (isHtmlSelectElement(element)) {
        const changed = element.value !== value;
        element.value = value;
        if (changed && options?.emitChange) element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
    }
    const root = dropdownRootForElement(element);
    if (root?.id) setDropdownValue(root.id, value, options);
}

export function setDropdownOptions(id: string, options: DropdownOption[], config?: DropdownSetOptionsConfig): string {
    const controller = getDropdownController(id);
    if (controller) return controller.setOptions(options, config);
    const element = document.getElementById(id);
    if (!isHtmlSelectElement(element)) return '';
    element.innerHTML = '';
    normalizeOptions(options).forEach((option) => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        optionEl.disabled = option.disabled;
        element.appendChild(optionEl);
    });
    const preferred = config?.preferredValue ?? element.value;
    if (preferred) element.value = preferred;
    if (!element.value && element.options.length > 0) element.value = element.options[0]!.value;
    if (config?.emitChange) element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value;
}

export function setDropdownDisabled(id: string, disabled: boolean): void {
    const controller = getDropdownController(id);
    if (controller) {
        controller.setDisabled(disabled);
        return;
    }
    const element = document.getElementById(id);
    if (isHtmlSelectElement(element)) element.disabled = disabled;
}

export function setDropdownDisabledForElement(element: Element | null, disabled: boolean): void {
    if (isHtmlSelectElement(element)) {
        element.disabled = disabled;
        return;
    }
    const root = dropdownRootForElement(element);
    if (root?.id) setDropdownDisabled(root.id, disabled);
}
