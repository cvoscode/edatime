/**
 * settingsHelp — page-level "?" help for the Settings panel.
 *
 * Settings is a modal (not a page section), so the trigger button
 * lives inside the modal header next to the title. It still uses the
 * same `initPageHelp` helper, which only requires the trigger id and
 * the content object.
 *
 * Wired from `initSettingsPanel` so the help loads the first time
 * the user opens the settings modal (lazy via the `settings-panel`
 * subsystem).
 */

import { initPageHelp, type PageHelpContent } from './pageHelp.js';

export const SETTINGS_HELP: PageHelpContent = {
    pageName: 'Settings',
    intro:
        'Global preferences that affect every page. Changes are previewed live; press Apply to save them or Reset to revert. The settings persist in `localStorage` and survive reloads.',
    sections: [
        {
            title: 'Appearance tab',
            body:
                'Theme and layout — the largest UX-affecting choices.',
            bullets: [
                'Color scheme — Dark, Light, or Auto (follows your OS preference)',
                'Layout density — Spacious / Roomy / Compact; affects paddings and chip sizes across the entire app',
                'Sidebar collapsed — start the app with the sidebar collapsed (also toggleable in-session with the sidebar collapse button)',
            ],
        },
        {
            title: 'Export tab',
            body:
                'Defaults for the per-page export buttons.',
            bullets: [
                'Default format — Image + CSV, PNG, SVG, HTML, or JSON; the format chosen by the page Export menu by default',
                'White background — render exported PNG/SVG with a white background (suitable for slides) instead of the dark theme surface',
            ],
        },
        {
            title: 'Analytics tab',
            body:
                'Defaults for the analytics overlays and the correlation page.',
            bullets: [
                'Default correlation metric — Pearson / Spearman / Kendall on raw values or first differences',
                'Default color scale — palette used by the scatter colorbar when you have not picked one yet',
            ],
        },
        {
            title: 'Causal tab',
            body:
                'Defaults for the Causal Discovery page.',
            bullets: [
                'Default method — PCMCI / PCMCI+ / FullCI / BivCI / LPCMCI',
                'Max lag (tau_max) — the largest lag the algorithm will consider',
            ],
        },
        {
            title: 'Spectral tab',
            body:
                'Defaults for FFT and Spectrogram.',
            bullets: [
                'FFT / Spectrogram preset — quick window-size presets that match common time-series resolutions',
            ],
        },
        {
            title: 'Timeseries tab',
            body:
                'Per-chart behaviour preferences.',
            bullets: [
                'Drawing auto-reset — automatically clear the current drawings when the dataset changes (recommended to avoid stale annotations)',
            ],
        },
        {
            title: 'Apply / Reset / Close',
            body:
                'Apply saves the draft settings and closes the panel; Reset reverts to the previous saved settings; Close discards the draft and exits without saving.',
        },
        {
            title: 'How the help button works',
            body:
                'The Settings panel lives in a modal, not a page section. Its "?" button uses the same help modal as every other page. Press Esc to close, or click outside the dialog.',
        },
    ],
    shortcuts: [
        { keys: 'Ctrl+,', description: 'Open the Settings panel' },
        { keys: 'Esc', description: 'Close the current modal (Settings, help, palette, etc.)' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'Ctrl+K', description: 'Command palette — every setting here is searchable' },
    ],
    tips: [
        'Apply is the only button that writes to `localStorage`; Reset reverts the draft; Close discards without saving. Choose carefully when there are unsaved changes — the title bar shows a dirty marker.',
        'Most settings take effect immediately as you change them (live preview), so you can flip between Dark and Light without reloading.',
        'If the layout feels off after a major browser-zoom change, Reset layout density to "Roomy" — the safest default.',
    ],
};

export function initSettingsHelp(): void {
    initPageHelp('settings', SETTINGS_HELP);
}