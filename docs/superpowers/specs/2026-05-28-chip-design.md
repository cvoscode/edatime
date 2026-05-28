# Unified Chip Component Design

**Date:** 2026-05-28
**Status:** Approved

## Goal

Abstract all page-specific chip implementations into a single `SeriesChip` component with consistent behavior across the app: color selection, on/off toggle, and optional three-dot menu.

## Component API

```typescript
interface SeriesChipProps {
  // Required
  column: string;
  checked: boolean;
  color: string;

  // Optional
  disabled?: boolean;
  adaptiveTarget?: boolean;      // show adaptive-target styling
  menuLabel?: string;            // aria-label for menu button
  label?: string;                // display text (default: column)
  title?: string;                // tooltip

  // Callbacks
  onToggle?: (checked: boolean) => void;
  onColorInput?: (color: string) => void;
  onMenuClick?: () => void;      // if omitted, menu button is not rendered
}
```

## Rendered Structure

```html
<label class="series-chip [active] [adaptive-target] [disabled]">
  <input type="checkbox" hidden>
  <input type="color" class="chip-color-picker">
  <span class="chip-label">Column Name</span>
  <!-- only rendered if onMenuClick provided -->
  <button class="chip-menu-btn" aria-label="...">
    <svg><!-- three dots --></svg>
  </button>
</label>
```

## Behavior

| Interaction | Action |
|-------------|--------|
| Click label/checkbox area | Toggle checkbox → call `onToggle(checked)` |
| Click color picker | Stop propagation → call `onColorInput(color)` |
| Click menu button | Stop propagation → call `onMenuClick()` |
| `disabled: true` | All interactions disabled, visual dimming |

## CSS Classes

- `.series-chip` — base chip
- `.series-chip.active` — checked/on state
- `.series-chip.adaptive-target` — adaptive filter target styling
- `.series-chip.disabled` — disabled state (50% opacity, no pointer events)
- `.chip-color-picker` — color input
- `.chip-label` — text label
- `.chip-menu-btn` — three-dot menu button

## Pages to Migrate

### 1. Timeseries (`frontend/src/features/timeseries/columnsController.ts`)
- Currently: inline HTML string building in `buildColumnToggles()`
- Change: replace with `SeriesChip()` component

### 2. FFT (`frontend/src/pages/fftPage.ts`)
- Currently: click chip to add/remove trace
- Change: checkbox toggle to add/remove; menu button for remove action

### 3. Causal (`frontend/src/causal/causalPage.ts`)
- Currently: click chip to toggle column selection
- Change: checkbox toggle; menu button opens edit panel

### 4. Existing `SeriesChip` (`frontend/src/components/molecules/SeriesChip.ts`)
- Enhance with optional menu support (`onMenuClick` prop)
- Add `disabled` prop support
- Add `menuLabel` prop for custom aria-label

## Out of Scope

- Modal behavior — the three-dot menu is optional; each page handles its own modal/menu UI
- FFT chip variants (`fft-trace-chip`) — handled via CSS class extension, not component props
- Range control chips — separate component (`range-chip`)

## Tasks

1. Enhance `SeriesChip` component with optional menu, disabled state, and enhanced props
2. Update `columnsController.ts` to use `SeriesChip`
3. Update `fftPage.ts` to use `SeriesChip` with checkbox toggle
4. Update `causalPage.ts` to use `SeriesChip` with checkbox toggle
5. Update CSS if needed for new states
6. Update tests to reflect new behavior