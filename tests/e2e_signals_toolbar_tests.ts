import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'ETTm2.csv', mimeType: 'text/csv', buffer: await readFile('ETTm2.csv') } },
        timeout: 60_000,
    });
    expect(response.ok()).toBeTruthy();
});

async function openSignals(page: Page) {
    await page.goto('/#page=timeseries');
    await expect(page.locator('#main-chart canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#quick-range-all')).toHaveAttribute('aria-pressed', 'true');
}

test('Signals toolbar keeps range actions visible and supports custom validation and exports', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openSignals(page);
    await page.locator('#quick-range-7d').click();
    await expect(page.locator('#quick-range-7d')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#zoom-range-badge')).not.toHaveText('Viewing 100%');
    const custom = page.locator('#quick-range-custom');
    await custom.locator('summary').click();
    const start = page.locator('#quick-range-custom-start');
    const end = page.locator('#quick-range-custom-end');
    const min = (await start.getAttribute('min'))!;
    const max = (await start.getAttribute('max'))!;
    await start.fill(max);
    await end.fill(min);
    await page.locator('#quick-range-custom-apply').click();
    await expect(page.locator('#quick-range-custom-error')).toContainText('Choose a valid range');
    await expect(custom).toHaveAttribute('open', '');
    await start.fill(min);
    await end.fill(max);
    await page.locator('#quick-range-custom-apply').click();
    await expect(custom).not.toHaveAttribute('open', '');
    await expect(custom.locator('summary')).toBeFocused();
    await expect(page.locator('#quick-range-all')).toHaveAttribute('aria-pressed', 'true');

    const exportMenu = page.locator('.signals-toolbar__export');
    await exportMenu.locator('summary').click();
    const png = page.waitForEvent('download');
    await page.locator('#export-png-btn').click();
    expect((await png).suggestedFilename()).toMatch(/\.png$/);
    await expect(exportMenu).not.toHaveAttribute('open', '');
    await exportMenu.locator('summary').click();
    const csv = page.waitForEvent('download');
    await page.locator('#export-csv-btn').click();
    expect((await csv).suggestedFilename()).toMatch(/\.csv$/);
    await exportMenu.locator('summary').click();
    await page.locator('#open-export-options-btn').click();
    await expect(page.locator('#export-options-modal')).toBeVisible();
    await expect(exportMenu).not.toHaveAttribute('open', '');
    await expect(page.locator('#export-options-close-btn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#export-options-done-btn')).toBeFocused();
    await page.locator('#export-options-done-btn').click();
    await expect(exportMenu.locator('summary')).toBeFocused();
});

test('Signals toolbar preserves drawing, labels, normalization and panel keyboard behavior', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openSignals(page);
    const draw = page.locator('#timeseries-draw-tools');
    await draw.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#timeseries-draw-panel')).toBeVisible();
    const drawingAvailable = await page.locator('#draw-width').isEnabled();
    if (drawingAvailable) {
        await page.locator('#draw-tool').getByRole('combobox').click();
        await page.getByRole('option', { name: 'Arrow', exact: true }).click();
        await expect(page.locator('#timeseries-draw-mode')).toHaveText('Arrow');
        await page.locator('#draw-width').fill('4');
        await page.locator('#draw-tool').getByRole('combobox').click();
        await page.keyboard.press('Escape');
        await expect(draw).toHaveAttribute('open', '');
    } else {
        await expect(page.locator('#draw-tool').getByRole('combobox')).toBeDisabled();
        await expect(page.locator('#draw-color')).toBeDisabled();
        await expect(page.locator('#timeseries-drawing-unavailable')).toBeVisible();
        await page.locator('#draw-help-btn').focus();
    }
    await page.screenshot({ path: testInfo.outputPath('drawing-panel.png') });
    await page.keyboard.press('Escape');
    await expect(draw).not.toHaveAttribute('open', '');
    await expect(draw.locator('summary')).toBeFocused();
    await draw.locator('summary').click();
    if (drawingAvailable) {
        await expect(page.locator('#timeseries-draw-mode')).toBeVisible();
        await expect(page.locator('#draw-width')).toHaveValue('4');
        await page.locator('#draw-tool').getByRole('combobox').click();
        await page.getByRole('option', { name: 'Zoom / inspect', exact: true }).click();
        await page.locator('#draw-clear-btn').click();
    }
    await page.locator('#quick-range-7d').click();
    await expect(draw).not.toHaveAttribute('open', '');

    await page.locator('#open-labels-panel-btn').click();
    await page.locator('#chart-title-input').fill('Toolbar verification');
    await page.locator('#chart-labels-done-btn').click();
    await expect(page.locator('#open-labels-panel-btn')).toBeFocused();
    await expect(page.locator('[data-signals-state="labels"]')).toBeVisible();
    await page.locator('#open-labels-panel-btn').click();
    await expect(page.locator('#chart-title-input')).toHaveValue('Toolbar verification');
    await page.locator('#chart-labels-done-btn').click();
    const chart = page.locator('#main-chart');
    await expect(page.locator('#main-chart-loading')).toBeHidden();
    const chartHash = async () => createHash('sha256').update(await chart.screenshot()).digest('hex');
    const original = await chartHash();
    await chart.screenshot({ path: testInfo.outputPath('normalization-original.png') });
    await page.locator('#timeseries-normalize-series').check();
    await expect.poll(chartHash).not.toBe(original);
    await chart.screenshot({ path: testInfo.outputPath('normalization-enabled.png') });
    await page.locator('#timeseries-normalize-series').uncheck();
    await chart.screenshot({ path: testInfo.outputPath('normalization-restored.png') });
    await expect.poll(chartHash).toBe(original);
    await page.locator('#open-notes-panel-btn').click();
    await expect(page.locator('#annotations-modal')).toBeVisible();
    await page.locator('#annotations-modal-close').click();
    await page.locator('#open-analytics-panel-btn').click();
    await expect(page.locator('#signals-analytics-modal')).toBeVisible();
    await page.locator('#rolling-enabled').check();
    await page.locator('#analytics-done-btn').click();
    await expect(page.locator('[data-signals-state="analytics"]')).toBeVisible();

    await page.locator('#timeseries-draw-tools > summary').click();
    await page.locator('.sidebar [data-page="scatter"]').click();
    await expect(page.locator('#heatmap-pair-plot')).toBeVisible();
    await page.locator('.sidebar [data-page="timeseries"]').click();
    await expect(draw).not.toHaveAttribute('open', '');
    await expect(page.locator('#draw-width')).toHaveValue(drawingAvailable ? '4' : '2');
    expect(errors).toEqual([]);
});

test('Signals toolbar stays within desktop, tablet, and phone viewports in both themes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1754, height: 1000 });
    await openSignals(page);
    for (const width of [1754, 1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const toolbar = page.locator('#timeseries-chart-toolbar');
        await expect(toolbar).toBeVisible();
        await expect(page.locator('#quick-range-all')).toBeVisible();
        await expect(page.locator('#open-notes-panel-btn')).toBeVisible();
        const bounds = await toolbar.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        if (width >= 1440) expect(bounds!.height).toBeLessThanOrEqual(110);
        const overflows = await toolbar.locator('button:visible, summary:visible, label:visible').evaluateAll((elements) =>
            elements.filter((element) => {
                const rect = element.getBoundingClientRect();
                return rect.left < 0 || rect.right > window.innerWidth + 1;
            }).map((element) => element.id || element.textContent));
        expect(overflows).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`signals-${width}-dark.png`) });
        await page.locator('#timeseries-draw-tools > summary').click();
        const panel = page.locator('#timeseries-draw-panel');
        await expect(panel).toBeVisible();
        await expect(page.locator('#draw-help-btn')).toBeVisible();
        const panelBounds = await panel.boundingBox();
        expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
        expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width + 1);
        await page.locator('#draw-help-btn').focus();
        await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#theme-toggle-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: testInfo.outputPath('signals-1440-light.png') });
    await page.locator('[data-toolbar-collapse-toggle="timeseries"]').click();
    await expect(page.locator('#timeseries-chart-toolbar')).toBeHidden();
    await expect(page.locator('.timeseries-result-toolbar')).toBeVisible();
    await page.locator('[data-toolbar-collapse-toggle="timeseries"]').click();
    await expect(page.locator('#timeseries-chart-toolbar')).toBeVisible();
});
