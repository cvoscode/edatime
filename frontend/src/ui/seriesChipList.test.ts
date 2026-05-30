import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSeriesChipList, updateSeriesChipList } from './seriesChipList.js';

// Mock the SeriesChip composite — only the factory function shape matters for these tests
vi.mock('./composites/SeriesChip.js', () => ({
    SeriesChip: vi.fn(({ column, label, checked, color, disabled, onToggle, onColorInput, onMenuClick }) => {
        const chip = document.createElement('div');
        chip.className = 'series-chip' + (checked ? ' active' : '');
        chip.dataset.col = column;
        chip.style.setProperty('--chip-accent', color);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', () => onToggle(checkbox.checked, column));
        chip.appendChild(checkbox);

        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'chip-label';
            labelEl.textContent = label;
            chip.appendChild(labelEl);
        }

        if (color) {
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = color;
            colorInput.className = 'chip-color-picker';
            colorInput.addEventListener('input', () => onColorInput(colorInput.value, column));
            chip.appendChild(colorInput);
        }

        if (onMenuClick) {
            const menuBtn = document.createElement('button');
            menuBtn.className = 'chip-menu-btn';
            menuBtn.addEventListener('click', () => onMenuClick(column));
            chip.appendChild(menuBtn);
        }

        return chip;
    }),
}));

function buildContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'test-chip-container';
    document.body.appendChild(el);
    return el;
}

function makeItem(overrides: Partial<{
    column: string; label: string; checked: boolean; color: string;
    disabled: boolean; menuLabel: string;
    onToggle: (c: boolean, col: string) => void;
    onColorInput: (color: string, col: string) => void;
    onMenuClick: (col: string) => void;
}> = {}): Parameters<typeof renderSeriesChipList>[0]['items'][number] {
    return {
        column: 'col_a',
        label: 'Column A',
        checked: false,
        color: '#aabbcc',
        onToggle: vi.fn(),
        onColorInput: vi.fn(),
        ...overrides,
    } as any;
}

describe('renderSeriesChipList', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = buildContainer();
    });

    it('renders one chip per item', () => {
        const items = [
            makeItem({ column: 'a' }),
            makeItem({ column: 'b' }),
            makeItem({ column: 'c' }),
        ];
        renderSeriesChipList({ container, items });
        expect(container.querySelectorAll('.series-chip')).toHaveLength(3);
    });

    it('calls onToggle with correct column when a chip checkbox is clicked', async () => {
        const onToggle = vi.fn();
        const items = [makeItem({ column: 'x_column', onToggle })];
        renderSeriesChipList({ container, items });

        const chip = container.querySelector<HTMLElement>('[data-col="x_column"]')!;
        const checkbox = chip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));

        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onToggle).toHaveBeenCalledWith(true, 'x_column');
    });

    it('calls onColorInput with correct column when color input changes', () => {
        const onColorInput = vi.fn();
        const items = [makeItem({ column: 'y_col', onColorInput })];
        renderSeriesChipList({ container, items });

        const chip = container.querySelector<HTMLElement>('[data-col="y_col"]')!;
        const colorInput = chip.querySelector<HTMLInputElement>('input[type="color"]')!;
        colorInput.value = '#ff0000';
        colorInput.dispatchEvent(new Event('input'));

        expect(onColorInput).toHaveBeenCalledTimes(1);
        expect(onColorInput).toHaveBeenCalledWith('#ff0000', 'y_col');
    });

    it('calls onMenuClick with correct column when menu button is clicked', () => {
        const onMenuClick = vi.fn();
        const items = [makeItem({ column: 'z_col', onMenuClick, menuLabel: 'Options' })];
        renderSeriesChipList({ container, items });

        const chip = container.querySelector<HTMLElement>('[data-col="z_col"]')!;
        chip.querySelector<HTMLButtonElement>('.chip-menu-btn')!.click();

        expect(onMenuClick).toHaveBeenCalledTimes(1);
        expect(onMenuClick).toHaveBeenCalledWith('z_col');
    });

    it('fires both per-item onToggle and onColorUpdate when color changes', () => {
        const onColorInput = vi.fn();
        const onColorUpdate = vi.fn();
        const items = [makeItem({ column: 'w_col', onColorInput })];
        renderSeriesChipList({ container, items, onColorUpdate });

        const chip = container.querySelector<HTMLElement>('[data-col="w_col"]')!;
        chip.querySelector<HTMLInputElement>('input[type="color"]')!.dispatchEvent(new Event('input'));

        expect(onColorInput).toHaveBeenCalledWith('#aabbcc', 'w_col');
        expect(onColorUpdate).toHaveBeenCalledWith('w_col', '#aabbcc');
    });
});

describe('updateSeriesChipList', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = buildContainer();
    });

    it('does not rebuild chips whose state is unchanged', () => {
        const onColorInput = vi.fn();
        const items = [
            makeItem({ column: 'a', color: '#111111', onColorInput }),
            makeItem({ column: 'b', color: '#222222', onColorInput }),
        ];

        // Initial render
        renderSeriesChipList({ container, items });
        const firstChip = container.querySelector<HTMLElement>('[data-col="a"]')!;

        // Update with same state — should reuse existing chips
        updateSeriesChipList({ container, items });
        const updatedFirstChip = container.querySelector<HTMLElement>('[data-col="a"]')!;

        expect(updatedFirstChip).toBe(firstChip); // Same element, not rebuilt
        expect(container.querySelectorAll('.series-chip')).toHaveLength(2);
    });

    it('removes chips whose column is no longer in items', () => {
        const items = [
            makeItem({ column: 'a' }),
            makeItem({ column: 'b' }),
        ];
        renderSeriesChipList({ container, items });
        expect(container.querySelectorAll('.series-chip')).toHaveLength(2);

        // Update with only column 'a'
        updateSeriesChipList({ container, items: [items[0]] });
        expect(container.querySelectorAll('.series-chip')).toHaveLength(1);
        expect(container.querySelector('[data-col="a"]')).toBeTruthy();
        expect(container.querySelector('[data-col="b"]')).toBeFalsy();
    });

    it('calls onColorUpdate with correct column when existing chip color is updated via onColorInput', () => {
        const onColorInput = vi.fn();
        const onColorUpdate = vi.fn();

        const items = [makeItem({ column: 'p', color: '#initial', onColorInput })];
        renderSeriesChipList({ container, items, onColorUpdate });

        const chip = container.querySelector<HTMLElement>('[data-col="p"]')!;
        const colorInput = chip.querySelector<HTMLInputElement>('input[type="color"]')!;
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(onColorInput).toHaveBeenCalledTimes(1);
        expect(onColorUpdate).toHaveBeenCalledWith('p', expect.any(String));
    });
});