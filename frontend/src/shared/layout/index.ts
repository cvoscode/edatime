/**
 * shared/layout — application layout primitives.
 *
 * Usage:
 *   import { AppShell, PageContainer, PageHeader, Toolbar } from '@/shared/layout';
 */
export { AppShell, default } from './AppShell';
export {
    PageContainer,
    PageHeader,
    PageFooter,
    type PageHeaderProps,
    type PageFooterProps,
    type PageContainerProps,
} from './PageContainer';
export {
    Toolbar,
    ToolbarLabel,
    ToolbarSpacer,
    ToolbarDivider,
    type ToolbarProps,
    type ToolbarLabelProps,
    type ToolbarSpacerProps,
    type ToolbarDividerProps,
} from './Toolbar';
export { default as AppShellModuleCss } from './AppShell.module.css';