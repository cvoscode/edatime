import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildSettingsDom(): void {
    document.body.innerHTML = `
        <button id="settings-btn" type="button">Settings</button>
        <div id="settings-modal" hidden>
            <div role="dialog" tabindex="-1">
                <button id="settings-close-btn" type="button">Close</button>
                <button id="settings-cancel-btn" type="button">Cancel</button>
                <button id="settings-apply-btn" type="button">Apply</button>
                <span id="settings-apply-indicator" hidden aria-hidden="true">•</span>
                <button id="settings-reset-btn" type="button">Reset</button>
                <button class="settings-tab-btn active" data-tab="appearance" type="button">Appearance</button>
                <button class="settings-tab-btn" data-tab="analytics" type="button">Analytics</button>
                <div class="settings-tab-panel" data-tab="appearance"></div>
                <div class="settings-tab-panel" data-tab="analytics" hidden></div>
                <select id="settings-theme">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="auto">Auto</option>
                </select>
                <select id="settings-layout">
                    <option value="spacious">Spacious</option>
                    <option value="roomy">Roomy</option>
                    <option value="compact">Compact</option>
                </select>
                <select id="settings-palette">
                    <option value="default">Default</option>
                    <option value="ocean">Ocean</option>
                </select>
                <div id="settings-palette-preview"></div>
                <select id="settings-correlation">
                    <option value="pearson_raw">Pearson</option>
                    <option value="spearman_raw">Spearman</option>
                </select>
                <select id="settings-spectrogram-max-points">
                    <option value="16384">Faster</option>
                    <option value="32768">Balanced</option>
                    <option value="65536">More detail</option>
                </select>
                <input id="settings-draw-auto-reset" type="checkbox" />
                <select id="settings-scale-signals" data-plot-color-scale="signals"><option value="viridis">Viridis</option><option value="plasma">Plasma</option></select>
                <select id="settings-scale-pair-plot" data-plot-color-scale="pairPlot"><option value="viridis">Viridis</option><option value="magma">Magma</option></select>
                <select id="settings-scale-correlation" data-plot-color-scale="correlationMatrix"><option value="coolwarm">Cool-Warm</option><option value="plasma">Plasma</option></select>
                <select id="settings-scale-time-frequency" data-plot-color-scale="timeFrequency"><option value="viridis">Viridis</option><option value="inferno">Inferno</option></select>
                <div data-scale-preview="signals"></div><div data-scale-preview="pairPlot"></div>
                <div data-scale-preview="correlationMatrix"></div><div data-scale-preview="timeFrequency"></div>
                <input id="settings-sidebar-collapsed" type="checkbox" />
                <input id="settings-inline-export-row-limit" type="number" />
                <input id="settings-parquet-export-row-limit" type="number" />
            </div>
        </div>
    `;
}

describe('settingsPanel', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
        buildSettingsDom();
    });

    it('reverts live theme and layout previews on Cancel', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue({
            ...settingsModule.DEFAULT_SETTINGS,
            theme: 'dark',
            layoutDensity: 'spacious',
        });
        const applyTheme = vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        const applyLayoutDensity = vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();

        const theme = document.getElementById('settings-theme') as HTMLSelectElement;
        theme.value = 'light';
        theme.dispatchEvent(new Event('change', { bubbles: true }));

        const layout = document.getElementById('settings-layout') as HTMLSelectElement;
        layout.value = 'compact';
        layout.dispatchEvent(new Event('change', { bubbles: true }));

        document.getElementById('settings-cancel-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(applyTheme).toHaveBeenCalledWith('light');
        expect(applyTheme).toHaveBeenLastCalledWith('dark');
        expect(applyLayoutDensity).toHaveBeenCalledWith('compact');
        expect(applyLayoutDensity).toHaveBeenLastCalledWith('spacious');
        expect(saveSettings).not.toHaveBeenCalled();
    });

    it('persists the draft only on Apply', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue({
            ...settingsModule.DEFAULT_SETTINGS,
            theme: 'dark',
            layoutDensity: 'spacious',
        });
        const applyTheme = vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        const applyLayoutDensity = vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();

        const theme = document.getElementById('settings-theme') as HTMLSelectElement;
        theme.value = 'light';
        theme.dispatchEvent(new Event('change', { bubbles: true }));

        const layout = document.getElementById('settings-layout') as HTMLSelectElement;
        layout.value = 'compact';
        layout.dispatchEvent(new Event('change', { bubbles: true }));

        document.getElementById('settings-apply-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            theme: 'light',
            layoutDensity: 'compact',
        }));
        expect(applyTheme).toHaveBeenLastCalledWith('light');
        expect(applyLayoutDensity).toHaveBeenLastCalledWith('compact');
    });

    it('shows the unsaved-changes indicator while the draft differs from the saved settings', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue({
            ...settingsModule.DEFAULT_SETTINGS,
            theme: 'dark',
            layoutDensity: 'spacious',
        });
        vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();

        const layout = document.getElementById('settings-layout') as HTMLSelectElement;
        layout.value = 'roomy';
        layout.dispatchEvent(new Event('change', { bubbles: true }));

        expect(document.getElementById('settings-apply-indicator')?.hidden).toBe(false);

        document.getElementById('settings-cancel-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('settings-apply-indicator')?.hidden).toBe(true);
    });

    it('persists independent plot color scales from the centralized form', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue(settingsModule.DEFAULT_SETTINGS);
        vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();
        (document.getElementById('settings-scale-pair-plot') as HTMLSelectElement).value = 'magma';
        (document.getElementById('settings-scale-correlation') as HTMLSelectElement).value = 'plasma';
        document.getElementById('settings-apply-btn')?.click();

        expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            plotColorScales: expect.objectContaining({ pairPlot: 'magma', correlationMatrix: 'plasma' }),
        }));
    });

    it('persists the spectrogram sample limit', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue(settingsModule.DEFAULT_SETTINGS);
        vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();
        (document.getElementById('settings-spectrogram-max-points') as HTMLSelectElement).value = '16384';
        document.getElementById('settings-apply-btn')?.click();

        expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            spectrogramMaxPoints: 16_384,
        }));
    });

    it('releases settings shortcuts when the owning shell is disposed', async () => {
        const panelModule = await import('./settingsPanel.js');
        const dispose = panelModule.initSettingsPanel();
        dispose();

        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: ',',
            ctrlKey: true,
            bubbles: true,
        }));

        expect(document.getElementById('settings-modal')?.hidden).toBe(true);
    });

    it('persists the export row caps from the Export tab', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue(settingsModule.DEFAULT_SETTINGS);
        vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();
        (document.getElementById('settings-inline-export-row-limit') as HTMLInputElement).value = '250000';
        (document.getElementById('settings-parquet-export-row-limit') as HTMLInputElement).value = '5000000';
        document.getElementById('settings-apply-btn')?.click();

        expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            inlineExportRowLimit: 250_000,
            parquetExportRowLimit: 5_000_000,
        }));
    });

    it('clamps too-small export row caps to the floor when persisting', async () => {
        const settingsModule = await import('../utils/settings.js');
        vi.spyOn(settingsModule, 'loadSettings').mockReturnValue(settingsModule.DEFAULT_SETTINGS);
        vi.spyOn(settingsModule, 'applyTheme').mockImplementation(() => { });
        vi.spyOn(settingsModule, 'applyLayoutDensity').mockImplementation(() => { });
        const saveSettings = vi.spyOn(settingsModule, 'saveSettings').mockImplementation(() => { });

        const panelModule = await import('./settingsPanel.js');
        panelModule.initSettingsPanel();
        panelModule.openSettingsModal();
        (document.getElementById('settings-inline-export-row-limit') as HTMLInputElement).value = '5';
        (document.getElementById('settings-parquet-export-row-limit') as HTMLInputElement).value = '0';
        document.getElementById('settings-apply-btn')?.click();

        expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            inlineExportRowLimit: settingsModule.MIN_INLINE_EXPORT_ROWS,
            parquetExportRowLimit: settingsModule.MIN_PARQUET_EXPORT_ROWS,
        }));
    });
});
