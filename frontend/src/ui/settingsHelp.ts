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
            title: 'Plot colors tab',
            body:
                'Independent continuous scales for numeric color encodings. Each preview shows the exact palette applied to that plot.',
            bullets: [
                'Signals — numeric Color by gradients',
                'Pair plot — density and numeric point colors',
                'Correlation matrix — negative-to-positive matrix scale',
                'Time-frequency — spectrogram magnitude or power',
                'Spectrum uses the categorical Chart palette; Causality and Drift retain stable semantic colors',
            ],
        },
        {
            title: 'Analytics tab',
            body:
                'Defaults for the analytics overlays and the correlation page.',
            bullets: [
                'Default correlation metric — Pearson / Spearman / Kendall on raw values or first differences',
                'Spectrogram sample limit — lower values compute faster and fit stricter server work budgets; higher values preserve more time detail',
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

export function initSettingsHelp(): () => void {
    return initPageHelp('settings', SETTINGS_HELP);
}
