import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ actionTimeout: 15_000 });

test.beforeAll(async ({ request }) => {
    // Keep the real schema and representative values without making layout
    // coverage wait for the full dataset's pairwise matrix computation.
    const rows = (await readFile('ETTm2.csv', 'utf8')).split('\n').slice(0, 2049).join('\n');
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'ETTm2-layout.csv', mimeType: 'text/csv', buffer: Buffer.from(`${rows}\n`) } },
        timeout: 60_000,
    });
    expect(response.ok()).toBeTruthy();
});

async function openRelationship(page: Page, route: 'correlation-matrix' | 'pair-plot') {
    await page.goto(`/#page=${route}`);
    const root = page.locator(route === 'correlation-matrix' ? '#page-heatmap' : '#heatmap-pair-plot');
    await expect(root).toBeVisible();
    if (route === 'correlation-matrix') {
        await expect(root.locator('.heatmap-cell').first()).toBeVisible({ timeout: 45_000 });
        await expect(page.locator('#heatmap-loading')).toBeHidden({ timeout: 45_000 });
    } else {
        await expect(page.locator('#scatter-chart canvas').first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#scatter-chart-loading')).toBeHidden({ timeout: 30_000 });
    }
    return root;
}

async function expectContained(root: Locator) {
    const layout = await root.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
            overflow: element.scrollWidth - element.clientWidth,
            controls: Array.from(element.querySelectorAll<HTMLElement>('button, input, select, summary, .dropdown__trigger'))
                .filter((control) => {
                    if (!control.checkVisibility() || !control.getClientRects().length) return false;
                    const rect = control.getBoundingClientRect();
                    return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
                }).map((control) => control.id || control.getAttribute('aria-label') || control.textContent?.trim()),
        };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.controls).toEqual([]);
}

async function openPanel(page: Page, id: string) {
    const panel = page.locator(`#${id}`);
    if (!await panel.evaluate(el => (el as HTMLDetailsElement).open)) {
        await panel.locator(':scope > summary').click();
    }
    await expect(panel).toHaveAttribute('open', '');
    return panel;
}

async function choose(page: Page, id: string, value: string) {
    await page.locator(`#${id}`).getByRole('combobox').click();
    await page.locator(`.dropdown__option[data-value="${value}"]:visible`).click();
}

async function expectColorSelection(page: Page, column: string) {
    await expect(page.locator('#scatter-color-column .dropdown__label')).toHaveText(column);
    await expect(page.locator('#scatter-chart-loading')).toBeHidden({ timeout: 30_000 });
    // The existing Canvas renderer suppresses the GPU color legend.
    if (await page.locator('#scatter-chart').getAttribute('data-scatter-density-support') === 'false') {
        await expect(page.locator('#scatter-colorbar-wrap')).toBeHidden();
    } else {
        await expect(page.locator('#scatter-colorbar-wrap')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#scatter-colorbar-name')).toContainText(column);
    }
}

for (const route of ['correlation-matrix', 'pair-plot'] as const) {
    test(`${route} keeps controls readable and charts contained from phone to ultrawide`, async ({ page }, testInfo) => {
        test.setTimeout(150_000);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 1440, height: 1000 });
        const root = await openRelationship(page, route);
        for (const width of [2560, 1920, 1440, 1280, 1024, 768, 640, 520, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await root.evaluate(el => { el.scrollTop = 0; });
            await expectContained(root);
            if (width >= 1280) {
                expect((await root.locator('.relationship-toolbar').boundingBox())!.height).toBeLessThanOrEqual(110);
            }
            for (const id of route === 'pair-plot' ? ['scatter-x-col', 'scatter-y-col'] : ['heatmap-metric', 'heatmap-color-column']) {
                const select = page.locator(`#${id}`).getByRole('combobox');
                await expect(select).toBeVisible();
                expect((await select.boundingBox())!.width).toBeGreaterThan(100);
            }
            if ([1440, 768, 390, 320].includes(width)) {
                await page.screenshot({ path: testInfo.outputPath(`${route}-${width}.png`) });
            }
            for (const panel of await root.locator('[data-toolbar-popover]').all()) {
                const trigger = panel.locator(':scope > summary');
                if (!await trigger.isVisible()) continue;
                await trigger.click();
                await expect(panel).toHaveAttribute('open', '');
                await expectContained(root);
                if (width <= 520) {
                    expect((await panel.locator('.relationship-toolbar__panel').boundingBox())!.width)
                        .toBeCloseTo((await root.locator('.relationship-toolbar').boundingBox())!.width, 0);
                }
                if ([1440, 390].includes(width)) {
                    await page.screenshot({ path: testInfo.outputPath(`${route}-${width}-${await panel.getAttribute('id')}.png`) });
                }
                await trigger.press('Escape');
                await expect(panel).not.toHaveAttribute('open', '');
                await expect(trigger).toBeFocused();
            }
            if (route === 'correlation-matrix' && width <= 520) {
                const grid = await root.locator('.heatmap-grid').boundingBox();
                const legend = await root.locator('.heatmap-grid-legend').boundingBox();
                expect(legend!.y + legend!.height).toBeLessThanOrEqual(grid!.y);
            }
            if (route === 'pair-plot' && width <= 640 && await page.locator('#scatter-colorbar-wrap').isHidden()) {
                const chart = await page.locator('#scatter-chart').boundingBox();
                const region = await root.locator('.scatter-view > .main').boundingBox();
                expect(chart!.width).toBeCloseTo(region!.width, 0);
            }
        }
        await page.locator('#mobile-header-menu-btn').click();
        await page.locator('[data-mobile-header-action="theme-toggle-btn"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await page.locator('html').evaluate(el => { el.style.fontSize = '24px'; });
        await expectContained(root);
        const clipped = await root.evaluate(el => Array.from(el.querySelectorAll<HTMLElement>('.relationship-toolbar .btn, .relationship-toolbar__toggle, .relationship-toolbar__trigger'))
            .filter(control => control.checkVisibility() && control.scrollHeight > control.clientHeight + 1)
            .map(control => control.textContent?.trim()));
        expect(clipped).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`${route}-phone-enlarged-light.png`) });
        await page.locator('html').evaluate(el => { el.style.fontSize = ''; });
        await page.setViewportSize({ width: 844, height: 390 });
        await expectContained(root);
        const exports = await openPanel(page, route === 'pair-plot' ? 'scatter-export-menu' : 'heatmap-export-menu');
        const lastFormat = exports.getByRole('button').last();
        await lastFormat.scrollIntoViewIfNeeded();
        await expect(lastFormat).toBeInViewport();
        await lastFormat.press('Escape');
        await expect(exports).not.toHaveAttribute('open', '');
        await root.evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: testInfo.outputPath(`${route}-landscape.png`) });
        expect(errors).toEqual([]);
    });
}

test('matrix density controls separate preview encodings and survive reloads', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let matrix = await openRelationship(page, 'correlation-matrix');

    expect(await page.locator('#heatmap-diagonal-mode .dropdown__label').textContent()).toContain('Density curve');
    expect(await page.locator('#heatmap-pair-mode .dropdown__label').textContent()).toContain('Density');
    await expect(page.locator('#heatmap-color-column')).toHaveAttribute('aria-disabled', 'true');
    await expect(matrix.locator('.heatmap-density-legend')).toBeVisible();
    const pairCell = matrix.locator('.heatmap-cell:not(.heatmap-cell--diagonal)').first();
    await expect(pairCell).toHaveClass(/heatmap-cell--density/);
    await expect(pairCell).toHaveAttribute('aria-label', /Horizontal axis: .+ vertical axis: .+ finite pairs plotted/);

    await openPanel(page, 'heatmap-display-options');
    await choose(page, 'heatmap-diagonal-mode', 'histogram');
    await choose(page, 'heatmap-pair-mode', 'scatter');
    await expect(page.locator('#heatmap-color-column')).toHaveAttribute('aria-disabled', 'false');
    await expect(matrix.locator('.heatmap-density-legend')).toBeHidden();
    await expect(pairCell).not.toHaveClass(/heatmap-cell--density/);
    await expect(matrix.locator('.heatmap-cell--diagonal.heatmap-cell--density')).toHaveCount(0);
    await expect(matrix.getByRole('grid')).toHaveAttribute('aria-label', /Pearson/);

    await page.reload();
    matrix = await openRelationship(page, 'correlation-matrix');
    expect(await page.locator('#heatmap-diagonal-mode .dropdown__label').textContent()).toContain('Histogram');
    expect(await page.locator('#heatmap-pair-mode .dropdown__label').textContent()).toContain('Scatter');
    await expect(page.locator('#heatmap-color-column')).toHaveAttribute('aria-disabled', 'false');
    await openPanel(page, 'heatmap-display-options');
    await choose(page, 'heatmap-pair-mode', 'density');
    await expect(page.locator('#heatmap-color-column')).toHaveAttribute('aria-disabled', 'true');
    await expect(matrix.locator('.heatmap-density-legend')).toBeVisible();
});

test('matrix controls, keyboard pair navigation, and pair options keep their existing behavior', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const matrix = await openRelationship(page, 'correlation-matrix');
    await choose(page, 'heatmap-metric', 'spearman_raw');
    await expect(matrix.getByRole('grid')).toHaveAttribute('aria-label', /Spearman/);
    await page.getByRole('checkbox', { name: 'Enable clustering', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Lock matrix order', exact: true }).check();
    await expect(page.locator('#heatmap-order-locked-status')).toBeVisible();
    const gridBefore = await matrix.getByRole('grid').boundingBox();
    const display = await openPanel(page, 'heatmap-display-options');
    expect((await matrix.getByRole('grid').boundingBox())!.y).toBe(gridBefore!.y);
    const exports = await openPanel(page, 'heatmap-export-menu');
    await expect(display).not.toHaveAttribute('open', '');
    await exports.locator('summary').press('Escape');
    await expect(exports.locator('summary')).toBeFocused();
    await openPanel(page, 'heatmap-display-options');
    await expect(page.locator('#heatmap-cell-size')).toBeVisible();
    await expect(page.locator('#heatmap-fit-toggle')).toBeVisible();
    await page.locator('#heatmap-axis-fit-toggle').click();
    await expect(page.locator('#heatmap-axis-fit-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expectContained(matrix);
    const cell = matrix.locator('.heatmap-cell[data-row-name="HUFL"][data-col-name="HULL"]');
    await cell.focus();
    await cell.press('Enter');
    const pair = page.locator('#heatmap-pair-plot');
    await expect(pair).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#scatter-x-col .dropdown__label')).toHaveText('HUFL');
    await expect(page.locator('#scatter-y-col .dropdown__label')).toHaveText('HULL');
    await expect(page.locator('#scatter-chart-loading')).toBeHidden({ timeout: 30_000 });
    await openPanel(page, 'scatter-display-options');
    await choose(page, 'scatter-diagonal-mode', 'kde');
    await choose(page, 'scatter-render-mode', 'scatter');
    await openPanel(page, 'scatter-refine-options');
    await choose(page, 'scatter-color-column', 'OT');
    await expectColorSelection(page, 'OT');
    await expectContained(pair);
    await page.screenshot({ path: testInfo.outputPath('pair-plot-color-and-options.png') });
    await page.reload();
    await expect(pair).toBeVisible();
    await expect(page.locator('#scatter-x-col .dropdown__label')).toHaveText('HUFL');
    await expect(page.locator('#scatter-y-col .dropdown__label')).toHaveText('HULL');
});

test.describe('Relationship touch layout', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('keeps pair selectors, named panels, and export menu usable by touch', async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const pair = await openRelationship(page, 'pair-plot');
        await page.locator('#scatter-x-col').getByRole('combobox').tap();
        await page.locator('.dropdown__option[data-value="HUFL"]:visible').tap();
        await page.locator('#scatter-y-col').getByRole('combobox').tap();
        await page.locator('.dropdown__option[data-value="OT"]:visible').tap();
        await expect(page.locator('#scatter-chart-loading')).toBeHidden({ timeout: 30_000 });
        await page.locator('#scatter-render-mode').getByRole('combobox').tap();
        await page.locator('.dropdown__option[data-value="scatter"]:visible').tap();
        await openPanel(page, 'scatter-refine-options');
        await page.locator('#scatter-clip-outliers').check();
        await expect(page.locator('#scatter-clip-outliers')).toBeChecked();
        await page.locator('#scatter-color-column').getByRole('combobox').tap();
        await page.locator('.dropdown__option[data-value="OT"]:visible').tap();
        await expectColorSelection(page, 'OT');
        await expectContained(pair);
        const menu = pair.locator('.scatter-export-group');
        await menu.locator(':scope > summary').tap();
        for (const format of ['PNG', 'SVG', 'HTML', 'CSV', 'JSON', 'Parquet']) {
            await expect(menu.getByRole('button', { name: format, exact: true })).toBeInViewport();
        }
        await page.screenshot({ path: testInfo.outputPath('pair-plot-phone-export.png') });
        const downloaded = page.waitForEvent('download');
        await menu.getByRole('button', { name: 'CSV', exact: true }).tap();
        const download = await downloaded;
        expect(await download.failure()).toBeNull();
        await expect(menu).not.toHaveAttribute('open', '');
        await expect(menu.locator('summary')).toBeFocused();
        expect((await readFile((await download.path())!, 'utf8')).split('\n').length).toBeGreaterThan(2);
    });
});
