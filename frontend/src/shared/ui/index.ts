/**
 * shared/ui — headless presentational primitives.
 *
 * All components are pure (no internal feature state) and accept children/render props.
 * CSS modules are re-exported from components/ui/ for compatibility.
 *
 * Usage:
 *   import { Button, Modal, Select } from '@/shared/ui';
 */
export { Button, type ButtonProps } from './Button';
export { Chip, type ChipProps } from './Chip';
export { Modal, type ModalProps } from './Modal';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Input, type InputProps } from './Input';
export { RangeSlider, type RangeSliderProps } from './RangeSlider';
export { Tabs, type TabsProps, type Tab } from './Tabs';
export { Badge, type BadgeProps } from './Badge';
export { Tooltip, type TooltipProps } from './Tooltip';
export { LoadingOverlay, type LoadingOverlayProps } from './LoadingOverlay';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { Dropdown, type DropdownProps, type DropdownOption } from './Dropdown';
export { IconButton, type IconButtonProps } from './IconButton';
export { SwitchToggle, type SwitchToggleProps } from './SwitchToggle';
export { addToast, removeToast, useToasts } from './toast';
export { default as ToastContainer } from './Toast';
export type { ToastMessage } from '@/types/domains';