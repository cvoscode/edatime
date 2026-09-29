import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'ETTm2.csv', mimeType: 'text/csv', buffer: await readFile('ETTm2.csv') } },
        timeout: 60_000,
    });
    expect(response.ok()).toBeTruthy();
});

async function openPreparation(page: Page) {
    await page.goto('/#page=preparation');
    await expect(page.locator('#prepare-profile-grid-rows')).toContainText('HULL', { timeout: 30_000 });
}

async function navigateSection(page: Page, id: string) {
    const select = page.locator('#prepare-section');
    if (await select.isVisible()) await select.selectOption(id);
    else await page.locator(`[data-prepare-section="${id}"]`).click();
    await expect(page.locator(`#${id}`)).toBeInViewport();
}

async function expectContained(page: Page) {
    const overflow = await page.locator('#page-prepare').evaluate((root) => {
        const page = root.getBoundingClientRect();
        const controls = Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [data-prepare-section]'));
        return {
            extraWidth: root.scrollWidth - root.clientWidth,
            controls: controls.filter((el) => {
                if (!el.getClientRects().length || el.closest('.profile-grid')) return false;
                const rect = el.getBoundingClientRect();
                return rect.left < page.left - 1 || rect.right > page.right + 1;
            }).map((el) => el.id || el.getAttribute('aria-label') || el.textContent?.trim()),
        };
    });
    expect(overflow.extraWidth).toBeLessThanOrEqual(1);
    expect(overflow.controls).toEqual([]);
}

test('Preparation reflows its report, all transformation forms, and sections across screen sizes', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPreparation(page);
    const build = page.getByRole('button', { name: 'Build exact quality report', exact: true });
    if (await build.isVisible()) await build.click();
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeVisible({ timeout: 30_000 });

    for (const width of [2560, 1920, 1440, 1280, 1024, 768, 640, 520, 390, 360, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('#page-prepare').evaluate((el) => { el.scrollTop = 0; });
        await expectContained(page);
        const toolbar = await page.locator('.prepare-workspace__toolbar').boundingBox();
        expect(toolbar!.height).toBeLessThan(155);
        if ([2560, 1440, 1024, 390, 320].includes(width)) {
            await page.screenshot({ path: testInfo.outputPath(`preparation-${width}-quality.png`), animations: 'disabled' });
        }
        await navigateSection(page, 'prepare-pipeline-stages');
        for (const value of ['0', '1', '2', '3', '4', '5', '6']) {
            await page.getByLabel('Transformation to add').selectOption(value);
            await expectContained(page);
        }
        if ([1440, 390].includes(width)) {
            await page.screenshot({ path: testInfo.outputPath(`preparation-${width}-composer.png`), animations: 'disabled' });
        }
        for (const id of ['prepare-pipeline-preview', 'prepare-export', 'prepare-insight-record', 'prepare-profile-findings']) {
            await navigateSection(page, id);
            await expectContained(page);
        }
    }
    const table = page.locator('#prepare-profile-grid-viewport');
    await table.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(500);
    await table.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(page.locator('#prepare-profile-grid .profile-grid-header').getByRole('columnheader', { name: 'Distribution' })).toBeInViewport();
    await page.locator('#prepare-profile-filter-input').fill('no-matching-column');
    await expect(page.locator('#prepare-profile-grid-rows')).toContainText('No columns match this filter');
    await page.locator('#prepare-profile-filter-input').clear();
    await expect(page.locator('#prepare-profile-grid-rows')).toContainText('HULL');
    await page.locator('#page-prepare').getByRole('button', { name: 'Focus view', exact: true }).click();
    await expect(page.locator('#prepare-section')).toBeHidden();
    await page.getByRole('button', { name: 'Show workspace controls', exact: true }).click();
    await expect(page.locator('#prepare-section')).toBeVisible();
    await expect(page.locator('#prepare-profile-grid-rows')).toContainText('HULL');
    expect(errors).toEqual([]);
});

test('Preparation remains usable in light theme, with enlarged text, and in phone landscape', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPreparation(page);
    await page.locator('#theme-toggle-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: testInfo.outputPath('preparation-desktop-light.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expectContained(page);
    await page.screenshot({ path: testInfo.outputPath('preparation-phone-light.png'), animations: 'disabled' });
    await page.locator('html').evaluate((el) => { el.style.fontSize = '24px'; });
    await expectContained(page);
    await navigateSection(page, 'prepare-pipeline-stages');
    await page.getByLabel('Transformation to add').selectOption('5');
    await expectContained(page);
    await page.screenshot({ path: testInfo.outputPath('preparation-enlarged-text.png'), animations: 'disabled' });
    await page.locator('html').evaluate((el) => { el.style.fontSize = ''; });
    await page.setViewportSize({ width: 844, height: 390 });
    await navigateSection(page, 'prepare-insight-record');
    await expectContained(page);
    await page.getByLabel('Evidence and rationale').fill('Responsive preparation verification');
    await expect(page.getByLabel('Evidence and rationale')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('preparation-landscape.png'), animations: 'disabled' });
});

test('Preparation explains the empty state and opens the dataset loader on a small phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/metadata', async (route) => {
        const response = await route.fetch();
        const metadata = await response.json();
        await route.fulfill({ response, json: { ...metadata, columns: [], column_profiles: [], total_rows: 0 } });
    });
    await page.goto('/#page=preparation');
    await expect(page.getByRole('heading', { name: 'Start with a dataset', exact: true })).toBeVisible();
    await expectContained(page);
    await page.screenshot({ path: testInfo.outputPath('preparation-empty-phone.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Load a dataset', exact: true }).click();
    await expect(page.locator('#page-upload')).toBeVisible();
});

test.describe('Preparation touch workflow', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('adds, previews, exports, and undoes a stage on a phone', async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openPreparation(page);
        await navigateSection(page, 'prepare-pipeline-stages');
        await page.getByLabel('Transformation to add').selectOption('6');
        const calculation = page.locator('form[data-stage-composer-kind="derivedColumn"]');
        await calculation.locator('input[name="expression"]').fill('HUFL + HULL');
        await calculation.locator('input[name="outputColumn"]').fill('combined_signal');
        await calculation.getByRole('button', { name: 'Add calculation' }).tap();
        await expect(page.locator('.prepare-workspace__stage')).toContainText('combined_signal');
        await expectContained(page);
        await page.locator('.prepare-workspace__stage-controls > summary').tap();
        await expectContained(page);
        await page.screenshot({ path: testInfo.outputPath('preparation-phone-stage-actions.png'), animations: 'disabled' });

        await navigateSection(page, 'prepare-pipeline-preview');
        await page.locator('#prepare-preview-button').tap();
        await expect(page.locator('#prepare-materialize-button')).toBeEnabled();
        await expect(page.locator('.prepare-workspace__stage-impact')).toContainText('69,680 rows after this stage');
        await navigateSection(page, 'prepare-export');
        for (const [label, filename] of [
            ['Download dataset (Parquet)', 'edatime_prepared.parquet'],
            ['Export plan JSON', 'edatime_cleaning_plan.json'],
            ['Export Python', 'apply_edatime_plan.py'],
            ['Export Rust', 'apply_edatime_plan.rs'],
            ['Export reproducibility bundle', 'edatime_handoff_bundle.zip'],
        ]) {
            const sidecarFilename = `${filename.replace(/\.[^.]+$/, '')}.provenance.json`;
            const downloadEvent = page.waitForEvent('download', (download) => download.suggestedFilename() === filename);
            const sidecarEvent = page.waitForEvent('download', (download) => download.suggestedFilename() === sidecarFilename);
            await page.locator('#prepare-export').getByRole('button', { name: label, exact: true }).tap();
            const [download, sidecar] = await Promise.all([downloadEvent, sidecarEvent]);
            expect(download.suggestedFilename()).toBe(filename);
            expect(sidecar.suggestedFilename()).toBe(sidecarFilename);
            expect(await download.failure()).toBeNull();
            expect(await sidecar.failure()).toBeNull();
            const sidecarBody = JSON.parse((await readFile((await sidecar.path())!)).toString());
            expect(sidecarBody.export.filename).toBe(filename);
            expect(sidecarBody.dataset.sourceVersionId).toBeTruthy();
            const body = await readFile((await download.path())!);
            if (filename.endsWith('.json')) {
                expect(JSON.parse(body.toString()).plan.stages[0].outputColumn).toBe('combined_signal');
            } else if (filename.endsWith('.parquet')) {
                expect(body.subarray(0, 4).toString()).toBe('PAR1');
                expect(body.includes(Buffer.from('combined_signal'))).toBe(true);
            } else if (filename.endsWith('.zip')) {
                expect(body.subarray(0, 2).toString()).toBe('PK');
            } else {
                expect(body.toString()).toContain('combined_signal');
            }
        }
        await page.getByRole('button', { name: 'Undo', exact: true }).tap();
        await expect(page.locator('.prepare-workspace__stage')).toHaveCount(0);
        await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
        await page.getByRole('button', { name: 'Redo', exact: true }).tap();
        await expect(page.locator('.prepare-workspace__stage')).toContainText('combined_signal');
        await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    });
});
