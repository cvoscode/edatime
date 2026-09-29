import { test, expect, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DatasetVersionRecord } from '../frontend/src/cleaning/api.js';

const sourcePath = 'ETTm2.csv';

test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'ETTm2.csv', mimeType: 'text/csv', buffer: await readFile(sourcePath) } },
        timeout: 60_000,
    });
    expect(response.ok()).toBeTruthy();
});

async function openPage(page: Page, name: string): Promise<void> {
    await page.goto(`/#page=${name}`);
    await expect(page.locator(`[data-page-name="${name}"]`)).toBeVisible({ timeout: 30_000 });
}

test('ETTm2 materialization survives reload and exports a version-matched provenance sidecar', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    const downloads: Download[] = [];
    const onDownload = (download: Download) => downloads.push(download);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('download', onDownload);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPage(page, 'prepare');
    await expect(page.locator('#prepare-workspace')).toContainText('69,680 rows');
    await page.getByLabel('Transformation to add').selectOption('3');
    await page.getByLabel('Columns to sort by').fill('date');
    await page.getByLabel('Columns to sort by').press('Enter');
    await page.locator('#prepare-preview-button').click();
    await expect(page.locator('#prepare-materialize-button')).toBeEnabled({ timeout: 30_000 });

    const appliedRequest = page.waitForResponse((response) => response.url().endsWith('/api/v1/cleaning/apply'));
    await page.locator('#prepare-materialize-button').click();
    const appliedResponse = await appliedRequest;
    expect(appliedResponse.ok()).toBeTruthy();
    const applied = await appliedResponse.json() as { sourceVersion: DatasetVersionRecord };
    const preparedVersionId = applied.sourceVersion.id;
    expect(applied.sourceVersion.displayName).toMatch(/ETTm2.*prepared/i);
    await expect(page.locator('#prepare-applied-history')).toContainText(`Applied plan for ${applied.sourceVersion.displayName}`);
    await expect(page.locator('#prepare-applied-history')).toContainText('1 saved stage');

    await page.reload();
    await openPage(page, 'prepare');
    await expect(page.locator('#dataset-switcher-label')).toContainText('ETTm2.csv');
    await expect(page.locator('#prepare-applied-history')).toContainText(`Applied plan for ${applied.sourceVersion.displayName}`);
    await expect(page.locator('#prepare-applied-history')).toContainText('1 saved stage');
    await expect(page.locator('#prepare-applied-history .prepare-workspace__applied-graph')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeVisible({ timeout: 30_000 });

    await openPage(page, 'timeseries');
    await expect(page.locator('#main-chart canvas').first()).toBeVisible({ timeout: 30_000 });
    const firstTrace = page.getByRole('checkbox').first();
    await expect(firstTrace).toHaveAccessibleName(/Toggle .+ series/);
    const initiallyChecked = await firstTrace.isChecked();
    await firstTrace.focus();
    await expect(firstTrace).toBeFocused();
    await page.keyboard.press('Space');
    await expect(firstTrace).toBeChecked({ checked: !initiallyChecked });
    await page.keyboard.press('Space');
    await expect(firstTrace).toBeChecked({ checked: initiallyChecked });
    const exportPopover = page.locator('.signals-toolbar__export');
    await exportPopover.locator('summary').click();
    const beforeExport = downloads.length;
    await page.locator('#export-csv-btn').click();
    await expect.poll(() => downloads.length - beforeExport, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    const exported = downloads.slice(beforeExport);
    const mainDownload = exported.find((download) => download.suggestedFilename().endsWith('.csv'));
    const sidecarDownload = exported.find((download) => download.suggestedFilename().endsWith('.provenance.json'));
    expect(mainDownload).toBeDefined();
    expect(sidecarDownload).toBeDefined();
    expect(await mainDownload!.failure()).toBeNull();

    const sidecar = JSON.parse(await readFile((await sidecarDownload!.path())!, 'utf8')) as {
        dataset: { sourceVersionId: string; name: string };
        selection: { visibleTraceCheckboxes: string[] };
        preparation: { appliedPlanHistory: { status: string; plan: { stages: unknown[] } | null }; draftPlanHash: string | null };
        analysis: { page: string };
    };
    expect(sidecar.dataset.sourceVersionId).toBe(preparedVersionId);
    expect(sidecar.dataset.name).toBe(applied.sourceVersion.displayName);
    expect(sidecar.selection.visibleTraceCheckboxes.length).toBeGreaterThan(0);
    expect(sidecar.preparation.appliedPlanHistory.status).toBe('available');
    expect(sidecar.preparation.appliedPlanHistory.plan?.stages).toHaveLength(1);
    expect(sidecar.preparation.draftPlanHash).toMatch(/^fnv1a-/);
    expect(sidecar.analysis.page).toBe('timeseries');
    await expect(page.locator('#export-provenance-retry')).toBeVisible();

    const retryCount = downloads.length;
    const retryDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Retry provenance JSON', exact: true }).click();
    expect((await retryDownload).suggestedFilename()).toBe(sidecarDownload!.suggestedFilename());
    await expect.poll(() => downloads.length).toBe(retryCount + 1);
    expect(errors).toEqual([]);
    page.off('download', onDownload);
});
