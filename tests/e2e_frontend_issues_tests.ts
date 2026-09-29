import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'ETTm2.csv', mimeType: 'text/csv', buffer: await readFile('ETTm2.csv') } },
        timeout: 60_000,
    });
    expect(response.ok()).toBeTruthy();
});

async function openUpload(page: Page): Promise<void> {
    await page.goto('/#page=upload');
    await expect(page.locator('#page-upload')).toBeVisible();
    await expect(page.locator('#upload-preview-status')).not.toContainText('Checking');
}

function file(name: string, column = 'value') {
    return {
        name,
        mimeType: 'text/csv',
        buffer: Buffer.from(`timestamp,other_time,${column}\n2024-01-01T00:00:00Z,2024-02-01T00:00:00Z,1\n2024-01-01T00:01:00Z,2024-02-01T00:01:00Z,2\n`),
    };
}

test('Overview and Data source recover the source, and exact findings survive navigation and reload', async ({ page }) => {
    await page.goto('/#page=home');
    await expect(page.locator('#home-active-dataset')).toBeVisible();
    await expect(page.locator('#home-dataset-rows')).toHaveText('69,680');
    await page.reload();
    await expect(page.locator('#home-dataset-rows')).toHaveText('69,680');
    await openUpload(page);
    await expect(page.locator('#upload-preview-status')).not.toContainText('No active dataset');
    const build = page.locator('#upload-profile-build-btn');
    if (await build.isVisible()) await build.click();
    await expect(page.locator('#profile-mode-badge')).toHaveAttribute('data-mode', 'exact', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Show quality details for HULL', exact: true }).click();
    const details = page.locator('#profile-grid-quality-details');
    await expect(details).toBeVisible();
    await expect(details).toHaveAttribute('open', '');
    await page.setViewportSize({ width: 414, height: 896 });
    await expect(details).toBeVisible();
    await expect(details).toHaveAttribute('open', '');
    await page.goto('/#page=preparation');
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeVisible();
});

test('replacing and clearing a file cannot submit stale preview settings', async ({ page }) => {
    await openUpload(page);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let requests = 0;
    await page.route('**/api/v1/upload/preview', async (route) => {
        requests += 1;
        if (requests === 2) await delayed;
        await route.continue().catch(() => {});
    });
    const input = page.locator('#file-upload');
    await input.setInputFiles(file('first.csv', 'first_value'));
    await expect(page.locator('#upload-btn')).toBeEnabled();
    await input.setInputFiles(file('replacement.csv', 'replacement_value'));
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('#upload-btn')).toBeDisabled();
    await expect(page.locator('#profile-grid-rows')).not.toContainText('first_value');
    await input.setInputFiles([]);
    release();
    await expect(page.locator('#file-name-display')).toBeEmpty();
    await expect(page.locator('#upload-btn')).toBeDisabled();
    await input.setInputFiles(file('current.csv', 'current_value'));
    await expect(page.locator('#upload-btn')).toBeEnabled();
    await expect(page.locator('#profile-grid-rows')).toContainText('current_value');
    await expect(page.locator('#profile-grid-rows')).not.toContainText('replacement_value');
});

test('successful ingestion clears ownership and cannot submit the invisible file twice', async ({ page }) => {
    await openUpload(page);
    page.on('dialog', (dialog) => dialog.accept());
    let uploads = 0;
    await page.route('**/api/v1/upload', async (route) => {
        uploads += 1;
        await route.fulfill({ json: { rows: 2 } });
    });
    await page.locator('#file-upload').setInputFiles(file('incoming.csv'));
    await expect(page.locator('#upload-btn')).toBeEnabled();
    await page.locator('#upload-btn').click();
    await expect(page.locator('#file-name-display')).toBeEmpty();
    await expect(page.locator('#upload-btn')).toBeDisabled();
    await page.locator('#upload-btn').dispatchEvent('click');
    expect(uploads).toBe(1);
});

test('matrix keyboard navigation preserves focus and Pair plot coefficients follow the selected axes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Exercise a cold route while its lazy feature descriptors are still loading.
    await page.route('**/src/app/pageModules.ts', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
    });
    await page.goto('/#page=correlation-matrix');
    const grid = page.locator('.heatmap-grid');
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#heatmap-loading')).toBeHidden({ timeout: 30_000 });
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
    const header = grid.locator('.heatmap-header').first();
    const name = await header.getAttribute('data-drag-name');
    await header.focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(grid.locator('.heatmap-header').nth(1)).toHaveAttribute('data-drag-name', name!);
    await expect(grid.locator('.heatmap-header').nth(1)).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(grid.locator('.heatmap-header').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const pair = await page.locator('.heatmap-cell:focus').evaluate((cell) => ({
        x: (cell as HTMLElement).dataset.rowName,
        y: (cell as HTMLElement).dataset.colName,
    }));
    const coefficientResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/v1/scatter/correlations'
        && response.request().postDataJSON()?.mode === 'pearson_raw'
        && response.request().postDataJSON()?.base === pair.x);
    await page.keyboard.press('Enter');
    await expect(page.locator('#heatmap-pair-plot')).toBeVisible();
    await expect(page.locator('#scatter-x-col .dropdown__label')).toHaveText(pair.x!);
    await expect(page.locator('#scatter-y-col .dropdown__label')).toHaveText(pair.y!);
    await page.locator('#scatter-summary-details > summary').click();
    const summary = page.locator('table[data-chart-summary="scatter"]');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary.locator('caption')).toContainText('Axis statistics use');
    await expect(summary.locator('.chart-summary-table__correlations')).toContainText('all eligible working data');
    const coefficients = await (await coefficientResponse).json() as { correlations: Array<{ column: string; value: number | null }> };
    const nextY = coefficients.correlations.find((row) => row.column !== pair.y && row.column !== pair.x && Number.isFinite(row.value));
    expect(nextY).toBeDefined();
    await page.getByRole('combobox', { name: 'Scatter Y column', exact: true }).click();
    await page.getByRole('option', { name: nextY!.column, exact: true }).click();
    await expect(summary.getByRole('rowheader', { name: nextY!.column, exact: true })).toBeVisible();
    const pearsonRow = summary.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Pearson r', exact: true }) });
    await expect(pearsonRow.getByRole('cell')).toHaveText(nextY!.value!.toFixed(4));
    expect(errors).toEqual([]);
});
