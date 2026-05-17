import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import ColumnChips from '../components/chart/ColumnChips';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const mockColumns = ['colA', 'colB', 'colC'];
const mockSelected = ['colA', 'colB'];
const mockColors: Record<string, string> = {
  colA: '#4a9eff',
  colB: '#ff9e4a',
  colC: '#9eff4a',
};

const onChange = vi.fn();
const onHiddenChange = vi.fn();
const onColorChange = vi.fn();
const onOpenFilter = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ColumnChips', () => {
  beforeEach(() => {
    onChange.mockClear();
    onHiddenChange.mockClear();
    onColorChange.mockClear();
    onOpenFilter.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all three chips for three columns', async () => {
    render(() => (
      <ColumnChips
        columns={mockColumns}
        selected={mockSelected}
        filter=""
        colors={mockColors}
        onChange={onChange}
        onColorChange={onColorChange}
        onOpenFilter={onOpenFilter}
        onHiddenChange={onHiddenChange}
      />
    ));

    expect(screen.getByText('colA')).toBeInTheDocument();
    expect(screen.getByText('colB')).toBeInTheDocument();
    expect(screen.getByText('colC')).toBeInTheDocument();
  });

  it('calls onColorChange when color input changes', async () => {
    render(() => (
      <ColumnChips
        columns={mockColumns}
        selected={mockSelected}
        filter=""
        colors={mockColors}
        onChange={onChange}
        onColorChange={onColorChange}
        onOpenFilter={onOpenFilter}
        onHiddenChange={onHiddenChange}
      />
    ));

    const colorSwatchInputs = screen.getAllByLabelText(/Color for/);
    // At least the selected chips (colA, colB) have color inputs
    expect(colorSwatchInputs.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(colorSwatchInputs[0], { target: { value: '#ff0000' } });

    expect(onColorChange).toHaveBeenCalledWith('colA', expect.any(String));
  });

  it('calls onHiddenChange and onChange when clicking a selected chip', async () => {
    render(() => (
      <ColumnChips
        columns={mockColumns}
        selected={mockSelected}
        filter=""
        colors={mockColors}
        onChange={onChange}
        onColorChange={onColorChange}
        onOpenFilter={onOpenFilter}
        onHiddenChange={onHiddenChange}
      />
    ));

    const chipElements = screen.getAllByText('colA');
    await userEvent.click(chipElements[0]);

    expect(onHiddenChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it('hides only the clicked chip while keeping others selected', async () => {
    render(() => (
      <ColumnChips
        columns={mockColumns}
        selected={mockSelected}
        filter=""
        colors={mockColors}
        onChange={onChange}
        onColorChange={onColorChange}
        onOpenFilter={onOpenFilter}
        onHiddenChange={onHiddenChange}
      />
    ));

    const chipElements = screen.getAllByText('colA');
    await userEvent.click(chipElements[0]);

    // onChange should have been called with colA removed from selection
    expect(onChange).toHaveBeenCalledWith(expect.not.arrayContaining(['colA']));
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['colB']));
  });

  it('shows a hidden chip again when clicked', async () => {
    render(() => (
      <ColumnChips
        columns={mockColumns}
        selected={['colB']}
        filter=""
        colors={mockColors}
        onChange={onChange}
        onColorChange={onColorChange}
        onOpenFilter={onOpenFilter}
        onHiddenChange={onHiddenChange}
      />
    ));

    const colAChips = screen.getAllByText('colA');
    expect(colAChips.length).toBe(1);

    await userEvent.click(colAChips[0]);

    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['colA', 'colB']));
  });
});