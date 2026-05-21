/**
 * PageContainer — consistent page wrapper with header slot, children, and optional footer.
 *
 * Provides a standard page structure:
 *   - Optional header (title + actions slot)
 *   - Scrollable content area
 *   - Optional footer actions
 *
 * @example
 * <PageContainer>
 *   <PageHeader title="Timeseries" actions={<ExportButton />} />
 *   <TimeseriesChart />
 *   <PageFooter>
 *     <Button onClick={handleReset}>Reset</Button>
 *   </PageFooter>
 * </PageContainer>
 */
import { Component, JSX, Show } from 'solid-js';
import styles from './PageContainer.module.css';

export interface PageHeaderProps {
    title?: string;
    subtitle?: string;
    /** Action buttons rendered in the top-right of the header */
    actions?: JSX.Element;
}

export const PageHeader: Component<PageHeaderProps> = (props) => (
    <Show when={props.title || props.actions}>
        <header class={styles.pageHeader}>
            <div class={styles.headerContent}>
                <Show when={props.title}>
                    <div class={styles.headerText}>
                        {props.title && <h1 class={styles.title}>{props.title}</h1>}
                        {props.subtitle && <p class={styles.subtitle}>{props.subtitle}</p>}
                    </div>
                </Show>
                <Show when={props.actions}>
                    <div class={styles.headerActions}>{props.actions}</div>
                </Show>
            </div>
        </header>
    </Show>
);

export interface PageFooterProps {
    children: JSX.Element;
}

export const PageFooter: Component<PageFooterProps> = (props) => (
    <footer class={styles.pageFooter}>{props.children}</footer>
);

export interface PageContainerProps {
    children?: JSX.Element;
    class?: string;
}

export const PageContainer: Component<PageContainerProps> = (props) => (
    <div class={`${styles.page} ${props.class ?? ''}`}>
        {props.children}
    </div>
);

export default PageContainer;