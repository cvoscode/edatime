/**
 * Configuration dialog for creating and editing annotations
 *
 * Provides a modal dialog for setting annotation properties:
 * - Label, color, line style, line width (for lines)
 * - Text content, color, font size (for text annotations)
 * - Label, color, marker size (for point annotations)
 */
import type { AnnotationConfig } from '../config/types.js';
export interface AnnotationConfigDialogOptions {
    readonly palette?: readonly string[];
    readonly zIndex?: number;
}
export interface AnnotationConfigDialog {
    showCreate(annotationType: 'lineX' | 'lineY' | 'text' | 'point', defaults: Partial<AnnotationConfig>, onSave: (config: AnnotationConfig) => void, onCancel: () => void): void;
    showEdit(annotation: AnnotationConfig, onSave: (updates: Partial<AnnotationConfig>) => void, onCancel: () => void): void;
    hide(): void;
    dispose(): void;
}
/**
 * Creates a configuration dialog for annotations
 */
export declare function createAnnotationConfigDialog(container: HTMLElement, options?: AnnotationConfigDialogOptions): AnnotationConfigDialog;
//# sourceMappingURL=createAnnotationConfigDialog.d.ts.map