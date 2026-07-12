import { setDropdownDisabled } from '../../ui/primitives/Dropdown.js';

export interface SpectrogramClipControls {
    enabled: boolean;
    methodRoot: HTMLElement | null;
    parameter: HTMLInputElement | null;
    band: HTMLElement | null;
}

export function syncSpectrogramClipControls({ enabled, methodRoot, parameter, band }: SpectrogramClipControls): void {
    const hint = enabled ? '' : "Enable the 'Outliers' toggle above to change the clip method";
    setDropdownDisabled('spectrogram-clip-method', !enabled);
    if (methodRoot) methodRoot.title = hint;
    if (parameter) {
        parameter.disabled = !enabled;
        parameter.title = hint;
    }
    const methodField = methodRoot?.closest('label, .toolbar-field') as HTMLElement | null;
    const parameterField = parameter?.closest('label, .toolbar-field') as HTMLElement | null;
    if (methodField) methodField.hidden = !enabled;
    if (parameterField) parameterField.hidden = !enabled;
    if (band) band.classList.toggle('is-hidden', !enabled);
}

export function syncSpectrogramClipLabel(label: HTMLElement | null, method: string): void {
    if (label) label.textContent = method === 'iqr' ? 'Clip k' : 'Clip %';
}
