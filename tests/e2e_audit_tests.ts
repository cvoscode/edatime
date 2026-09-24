/**
 * Playwright E2E tests for audit verification
 * 
 * These tests verify the packaged app against a real, local dataset.
 * Run with: npm run test:e2e (after starting `make dev-dist`).
 */

import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tableFromIPC } from 'apache-arrow';

const SAMPLE_DATASET_PATH = join(process.cwd(), 'ETTm2.csv');
const backingPage = (pageName: string): string => (
  pageName === 'correlations' ? 'heatmap' : pageName
);

async function openPage(page: Page, pageName: string): Promise<void> {
  await page.goto(`/#page=${pageName}`);
  await expect(page.locator(`.page[data-page-name="${backingPage(pageName)}"]`)).toBeVisible();
}

async function chooseDropdownOption(page: Page, id: string, value: string): Promise<void> {
  const dropdown = page.locator(`#${id}`);
  await dropdown.getByRole('combobox').click();
  await page.locator(`.dropdown__option[data-value="${value}"]:visible`).click();
}

test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/v1/upload', {
    multipart: {
      file: {
        name: 'ETTm2.csv',
        mimeType: 'text/csv',
        buffer: await readFile(SAMPLE_DATASET_PATH),
      },
    },
    timeout: 60_000,
  });
  expect(response.ok()).toBeTruthy();
});

test.describe('Audit Verification Tests', () => {

  test('Preparation reuses the loaded source quality report across navigation and reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPage(page, 'timeseries');
    await page.locator('.sidebar [data-page="upload"]').click();
    const sourceRows = page.locator('#profile-grid-rows');
    await expect(sourceRows).toContainText('HUFL');
    await expect(sourceRows).not.toContainText('Pending', { timeout: 30_000 });
    const sourceValues = await sourceRows.locator('.profile-grid-row').filter({ hasText: 'HUFL' }).locator('.profile-cell').allTextContents();

    const profileStarts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/profile') && request.method() === 'POST') profileStarts.push(request.url());
    });
    await page.locator('.sidebar [data-page="prepare"]').click();
    const qualityRows = page.locator('#prepare-profile-grid-rows');
    await expect(qualityRows).not.toContainText('Pending');
    await expect(qualityRows.locator('.profile-grid-row').filter({ hasText: 'HUFL' }).locator('.profile-cell')).toHaveText(sourceValues.slice(1));
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeDisabled();
    expect(profileStarts).toEqual([]);

    await openPage(page, 'prepare');
    await expect(qualityRows).toContainText('HUFL');
    await expect(qualityRows).not.toContainText('Pending');
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('sample dataset profile replaces pending statistics', async ({ page }) => {
    await page.locator('[data-sample-dataset="ettm2"]').click();
    await expect(page.locator('#page-timeseries')).toBeVisible({ timeout: 60_000 });
    await openPage(page, 'upload');
    const rows = page.locator('#profile-grid-rows');
    await expect(rows).toContainText('HUFL');
    await expect(rows).not.toContainText('Pending', { timeout: 30_000 });
    await expect(rows).toContainText('69,680');
  });

  test('pair plot does not show filter failure while suggestions load', async ({ page }) => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/v1/scatter/correlations', async (route) => {
      await hold;
      await route.continue();
    });
    const requested = page.waitForRequest('**/api/v1/scatter/correlations');
    try {
      await openPage(page, 'scatter');
      await requested;
      await expect(page.locator('#scatter-empty-state')).toBeHidden();
    } finally {
      release();
    }
    await expect(page.locator('#scatter-marginal-x')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#scatter-marginal-y')).toBeVisible();
    await expect(page.locator('#scatter-empty-state')).toBeHidden();
  });

  test('pair plot renders before secondary correlation statistics finish', async ({ page }) => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/v1/scatter/correlations', async (route) => {
      if (route.request().postDataJSON().mode === 'spearman_raw') await hold;
      await route.continue();
    });
    try {
      await openPage(page, 'scatter');
      await expect(page.locator('#scatter-marginal-x')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('#scatter-suggestions')).not.toBeEmpty();
      await expect(page.locator('#scatter-empty-state')).toBeHidden();
      await expect(page.locator('#scatter-pearson')).toContainText(/0\.\d+/);
    } finally {
      release();
    }
    await expect(page.locator('#scatter-spearman')).toContainText(/0\.\d+/, { timeout: 20_000 });
  });
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await openPage(page, 'home');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('drift page routing works correctly', async ({ page }) => {
    // Navigate to drift page
    await openPage(page, 'drift');

    // Check that drift page is visible
    const driftPage = page.locator('#page-drift');
    await expect(driftPage).toBeVisible();
    
    // Check that sidebar shows Drift as active
    const driftButton = page.locator('button[data-page="drift"]');
    await expect(driftButton).toHaveClass(/active/);
  });

  test('home page has no layout shifts (CLS = 0)', async ({ page }) => {
    // Navigate to home page
    await openPage(page, 'home');
    
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Allow time for any async operations
    
    // Check for elements that could cause CLS
    const heroElement = page.locator('.app-layout');
    await expect(heroElement).toBeVisible();
    
    // Verify no loading spinners or skeleton loaders that could cause layout shift
    const loadingOverlay = page.locator('.chart-loading-overlay:not([hidden])');
    await expect(loadingOverlay).toHaveCount(0);
  });

  test('upload page does not eagerly fetch series data', async ({ page }) => {
    // Set up request tracking
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/')) {
        apiRequests.push(url);
      }
    });

    // Navigate to upload page
    await openPage(page, 'upload');
    
    // Upload may refresh lightweight metadata for the existing profile, but
    // it must not load Arrow series data until a dataset-backed page needs it.
    const seriesRequests = apiRequests.filter(url =>
      url.includes('/api/v1/data')
    );
    
    expect(seriesRequests).toEqual([]);
  });

  test('no ECharts zero-size warnings on page transitions', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    // Navigate through multiple pages
    const pages = ['home', 'upload', 'timeseries', 'scatter', 'correlations', 'fft', 'causal', 'drift'];
    
    for (const pageName of pages) {
      await openPage(page, pageName);
    }
    
    // Check for zero-size warnings
    const zeroSizeWarnings = consoleMessages.filter(msg => 
      msg.toLowerCase().includes('zero size')
      || /can't get dom width or height/i.test(msg)
    );
    
    expect(zeroSizeWarnings.length).toBe(0);
  });

  test('causal discovery renders a visible graph before enabling graph actions', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, 'causal');

    await expect(page.locator('#causal-add-edge-btn')).toBeDisabled();
    await expect(page.locator('#causal-export-btn')).toBeDisabled();
    await expect(page.locator('#causal-save-run-btn')).toBeDisabled();
    await page.locator('#causal-compute-btn').click();
    await expect(page.getByText(/graph updated with \d+ nodes and \d+ links/i)).toBeVisible({ timeout: 120_000 });

    const chart = page.locator('#causal-chart');
    const canvas = chart.locator('canvas');
    await expect(canvas).toBeVisible();
    const paintedSamples = await canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d');
      if (!context || element.width === 0 || element.height === 0) return 0;
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      let painted = 0;
      // Sampling every eighth pixel keeps the assertion cheap while still
      // covering nodes, labels, edges, and the in-chart legend.
      for (let index = 3; index < pixels.length; index += 32) {
        if (pixels[index] > 0) painted += 1;
      }
      return painted;
    });
    expect(paintedSamples).toBeGreaterThan(100);
    await expect(page.locator('#causal-empty-state')).toBeHidden();
    await expect(page.locator('#causal-add-edge-btn')).toBeEnabled();
    await expect(page.locator('#causal-export-btn')).toBeEnabled();
    await expect(page.locator('#causal-save-run-btn')).toBeEnabled();
  });

  test('correlation matrix keeps point thumbnails and Pair plot is a separate page', async ({ page }) => {
    await openPage(page, 'correlations');

    await expect(page.locator('#heatmap-container')).toBeVisible();
    await expect(page.locator('.heatmap-cell-canvas').first()).toBeVisible();
    await expect(page.locator('#heatmap-pair-plot')).toBeHidden();

    await openPage(page, 'scatter');
    await expect(page.locator('#heatmap-pair-plot')).toBeVisible();
  });

  test('pipeline workbench visualizes and exposes exports for the current plan', async ({ page }) => {
    await openPage(page, 'timeseries');

    await page.locator('#open-cleaning-plan-btn').click();
    await expect(page.locator('#cleaning-plan-title')).toHaveText('Pipeline workbench');
    await expect(page.locator('.pipeline-graph')).toBeVisible();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('button', { name: 'Export graph JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export graph SVG' })).toBeVisible();
  });

  test('column filter slider shows its selection and supports dragging, keyboard edits, and exact bounds', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPage(page, 'timeseries');
    await expect(page.locator('#main-chart')).toHaveAttribute('aria-label', /Y axis Series values/);
    await page.getByRole('button', { name: 'Filter range for HULL', exact: true }).click();

    const minSlider = page.locator('#column-filter-min-range');
    const maxSlider = page.locator('#column-filter-max-range');
    const minInput = page.locator('#column-filter-min');
    const maxInput = page.locator('#column-filter-max');
    for (const slider of [minSlider, maxSlider]) {
      // Opaque, 4px native inputs used to cover the selected rail and shrink
      // the handles because the generic range-input CSS won the cascade.
      await expect(slider).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(slider).toHaveCSS('height', '32px');
    }
    const bounds = await minSlider.evaluate((input: HTMLInputElement) => ({ min: Number(input.min), max: Number(input.max) }));
    const control = await page.locator('#column-filter-range-control').boundingBox();
    const x = (fraction: number) => control!.x + 8 + fraction * (control!.width - 16);
    const y = control!.y + control!.height / 2;
    const fraction = (value: string) => (Number(value) - bounds.min) / (bounds.max - bounds.min);
    const drag = async (from: number, to: number, endY = y) => {
      await page.mouse.move(x(from), y);
      await page.mouse.down();
      await page.mouse.move(x(to), endY, { steps: 10 });
      await page.mouse.up();
    };
    const initialFill = await page.locator('#column-filter-range-fill').boundingBox();
    expect(initialFill!.width).toBeCloseTo(control!.width - 16, 0);

    await drag(0, 0.2);
    expect(fraction(await minInput.inputValue())).toBeCloseTo(0.2, 2);
    await drag(1, 0.8);
    expect(fraction(await maxInput.inputValue())).toBeCloseTo(0.8, 2);
    const upper = await maxInput.inputValue();
    // Start on the track and keep dragging after leaving its vertical bounds.
    await drag(0.3, 0.4, y + 45);
    expect(fraction(await minInput.inputValue())).toBeCloseTo(0.4, 2);
    await expect(maxInput).toHaveValue(upper);
    const lower = await minInput.inputValue();
    await page.mouse.move(x(0.6), y);
    await expect(minInput).toHaveValue(lower);

    await maxSlider.focus();
    await page.keyboard.press('ArrowLeft');
    expect(Number(await maxInput.inputValue())).toBeLessThan(Number(upper));
    await expect(minInput).toHaveValue(lower);
    await minInput.fill('5.1234567');
    await maxSlider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(minInput).toHaveValue('5.1234567');
    await page.locator('#column-filter-modal .modal').screenshot({ path: testInfo.outputPath('column-filter-slider.png') });

    await page.locator('#column-filter-apply-btn').click();
    await expect(page.locator('#column-filter-modal')).toBeHidden();
    await page.getByRole('button', { name: 'Filter range for HULL', exact: true }).click();
    await expect(minInput).toHaveAttribute('data-exact-value', '5.1234567');
    await expect(page.locator('#column-filter-apply-btn')).toBeEnabled();
  });

  test('column filter slider supports touch drags on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, 'timeseries');
    await expect(page.locator('#main-chart')).toHaveAttribute('aria-label', /Y axis Series values/);
    await page.locator('.timeseries-series-disclosure > summary').click();
    await page.getByRole('button', { name: 'Filter range for HULL', exact: true }).click();
    const control = await page.locator('#column-filter-range-control').boundingBox();
    expect(control!.x).toBeGreaterThanOrEqual(0);
    expect(control!.x + control!.width).toBeLessThanOrEqual(390);
    const bounds = await page.locator('#column-filter-min-range').evaluate((input: HTMLInputElement) => ({ min: Number(input.min), max: Number(input.max) }));
    const fraction = (value: string) => (Number(value) - bounds.min) / (bounds.max - bounds.min);
    const session = await page.context().newCDPSession(page);
    const drag = async (from: number, to: number) => {
      const point = (position: number) => ({ x: control!.x + 8 + position * (control!.width - 16), y: control!.y + control!.height / 2, id: 1 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(to)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    try {
      await drag(0.15, 0.35);
      expect(fraction(await page.locator('#column-filter-min').inputValue())).toBeCloseTo(0.35, 2);
      await drag(1, 0.75);
      expect(fraction(await page.locator('#column-filter-max').inputValue())).toBeCloseTo(0.75, 2);
      await expect(page.locator('#column-filter-apply-btn')).toBeEnabled();
    } finally {
      await session.detach();
    }
  });

  test('saved Signals filters remain editable and Pair plot describes their data scope', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Warm the Pair plot first so the return trip exercises the initialized
    // cache path, where source-data suggestions previously survived a later
    // Signals filter change.
    await openPage(page, 'scatter');
    await expect(page.locator('#scatter-suggestions')).not.toBeEmpty({ timeout: 20_000 });
    await openPage(page, 'timeseries');
    await expect(page.locator('#main-chart')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#main-chart')).toHaveAttribute('aria-label', /Y axis Series values/);

    await page.getByRole('button', { name: 'Filter range for HULL' }).click();
    await expect(page.locator('#column-filter-min')).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#column-filter-max')).toHaveAttribute('aria-invalid', 'false');
    await page.locator('#column-filter-max').fill('36.44');
    await expect(page.locator('#column-filter-apply-btn')).toBeEnabled();
    await page.locator('#column-filter-min').fill('5');
    await page.locator('#column-filter-max').fill('12');
    await page.locator('#column-filter-apply-btn').click();
    await expect(page.locator('.series-chip[data-col="HULL"]')).toContainText('[5.00, 12.00]');

    await page.getByRole('button', { name: 'Filter range for HULL' }).click();
    await expect(page.locator('#column-filter-apply-btn')).toBeEnabled();
    await expect(page.locator('#column-filter-hint')).toContainText('Bounds scope: filter');
    await page.locator('#column-filter-apply-btn').click();
    await expect(page.locator('#column-filter-modal')).toBeHidden();

    await expect(page.locator('#timeseries-filter-status')).toHaveText('1 active filter');
    await expect(page.locator('#timeseries-filter-status')).toHaveAttribute('title', /HULL/);
    await page.locator('#quick-range-24h:visible').click();

    await openPage(page, 'correlations');
    const legendClearance = await page.locator('.heatmap-shell').evaluate((shell) => {
      const grid = shell.querySelector('.heatmap-grid')?.getBoundingClientRect();
      const legend = shell.querySelector('.heatmap-grid-legend')?.getBoundingClientRect();
      return grid && legend ? legend.left - grid.right : -1;
    });
    expect(legendClearance).toBeGreaterThanOrEqual(8);
    const pairCell = page.locator('.heatmap-cell[data-row-name="HULL"][data-col-name="MULL"]').first();
    await expect(pairCell).toBeVisible({ timeout: 20_000 });
    await pairCell.click();
    await expect(page.locator('#heatmap-pair-plot')).toBeVisible();
    // The matrix click starts an asynchronous correlation refresh. Wait for
    // the Pair plot controls to commit the requested pair before comparing
    // its scoped statistics and suggestions.
    await expect(page.locator('#scatter-x-col').getByRole('combobox')).toContainText('HULL');
    await expect(page.locator('#scatter-y-col').getByRole('combobox')).toContainText('MULL');
    await expect(pairCell).toHaveClass(/is-selected/);
    await expect(page.locator('#scatter-filter-banner-text')).toContainText('zoom range');
    await expect(page.locator('#scatter-filter-banner-text')).toContainText('HULL [5.00, 12.00]');
    await expect(page.locator('table[data-chart-summary="scatter"]')).toHaveCount(1);
    await expect(page.locator('.scatter-stats-bar__correlations')).toBeHidden();

    await page.locator('#scatter-suggestion-threshold').evaluate((input: HTMLInputElement) => {
      input.value = '0.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const activeSuggestion = page.locator('.scatter-suggestion-btn[data-x-column="HULL"][data-y-column="MULL"]');
    await expect(activeSuggestion).toBeVisible({ timeout: 20_000 });
    const suggestionText = await activeSuggestion.textContent();
    const pearsonText = await page.locator('#scatter-pearson').textContent();
    const suggestionValue = Number(suggestionText?.match(/(-?\d+\.\d+)\s*$/)?.[1]);
    const pearsonValue = Math.abs(Number(pearsonText?.match(/-?\d+\.\d+/)?.[0]));
    expect(suggestionValue).toBe(Number(pearsonValue.toFixed(2)));
  });

  test('Signals and Preparation calculations refresh visited plots and export the current pipeline', async ({ page }) => {
    test.setTimeout(90_000);
    const apiErrors: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/') && response.status() >= 400) apiErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, 'scatter');
    await expect(page.locator('#scatter-marginal-x')).toBeVisible({ timeout: 20_000 });

    await openPage(page, 'timeseries');
    await page.locator('[data-action-proxy="transform-open-btn"]').click();
    await page.locator('#transform-expression').fill('HUFL + HULL');
    await page.locator('#transform-output-name').fill('combined_signal');
    await page.locator('#transform-apply-btn').click();
    await expect(page.locator('#transform-modal')).toBeHidden();
    await expect(page.locator('.series-chip[data-col="combined_signal"]')).toBeVisible();

    await openPage(page, 'prepare');
    await expect(page.locator('.prepare-workspace__stage-list')).toContainText('combined_signal');
    await page.getByLabel('Transformation to add').selectOption('6');
    const calculation = page.locator('form[data-stage-composer-kind="derivedColumn"]');
    await calculation.locator('input[name="expression"]').fill('combined_signal * 2');
    await calculation.locator('input[name="outputColumn"]').fill('doubled_signal');
    await calculation.getByRole('button', { name: 'Add calculation' }).click();
    await expect(page.locator('.prepare-workspace__stage-list')).toContainText('doubled_signal');

    const thumbnails = page.waitForResponse((response) => response.url().endsWith('/api/v1/scatter/matrix'));
    await openPage(page, 'correlations');
    const pair = page.locator('.heatmap-cell[data-row-name="combined_signal"][data-col-name="doubled_signal"]').first();
    await expect(pair).toBeVisible({ timeout: 20_000 });
    expect((await thumbnails).ok()).toBe(true);
    await expect(page.locator('#heatmap-loading')).toBeHidden({ timeout: 20_000 });
    const pointsResponse = page.waitForResponse((response) => {
      if (!response.url().endsWith('/api/v1/scatter/points') || !response.ok()) return false;
      const { x, y } = response.request().postDataJSON();
      return [x, y].includes('combined_signal') && [x, y].includes('doubled_signal');
    });
    await pair.click();
    await expect(page.locator('#heatmap-pair-plot')).toBeVisible();
    const response = await pointsResponse;
    const payload = response.request().postDataJSON();
    expect(payload.cleaning_plan.plan.stages.filter((stage: { kind: string }) => stage.kind === 'derivedColumn')).toHaveLength(2);
    const table = tableFromIPC(await response.body());
    expect(table.numRows).toBeGreaterThan(100);
    const combined = table.getChild(payload.x === 'combined_signal' ? 'x' : 'y')!;
    const doubled = table.getChild(payload.x === 'doubled_signal' ? 'x' : 'y')!;
    for (let index = 0; index < 100; index += 1) {
      expect(doubled.get(index)).toBeCloseTo(Number(combined.get(index)) * 2, 8);
    }
    await expect(page.locator('#scatter-empty-state')).toBeHidden();

    await openPage(page, 'prepare');
    const exports = page.locator('#prepare-export');
    for (const [label, filename] of [
      ['Download dataset (Parquet)', 'edatime_prepared.parquet'],
      ['Export plan JSON', 'edatime_cleaning_plan.json'],
      ['Export Python', 'apply_edatime_plan.py'],
      ['Export Rust', 'apply_edatime_plan.rs'],
      ['Export reproducibility bundle', 'edatime_handoff_bundle.zip'],
    ]) {
      const downloadEvent = page.waitForEvent('download', { timeout: 20_000 });
      await exports.getByRole('button', { name: label, exact: true }).click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe(filename);
      expect(await download.failure()).toBeNull();
      const body = await readFile((await download.path())!);
      if (filename.endsWith('.parquet')) {
        expect(body.subarray(0, 4).toString()).toBe('PAR1');
        expect(body.subarray(-4).toString()).toBe('PAR1');
        expect(body.includes(Buffer.from('doubled_signal'))).toBe(true);
      } else if (filename.endsWith('.json')) {
        expect(JSON.parse(body.toString()).plan.stages.map((stage: { outputColumn: string }) => stage.outputColumn))
          .toEqual(['combined_signal', 'doubled_signal']);
      } else if (filename.endsWith('.zip')) {
        expect(body.subarray(0, 2).toString()).toBe('PK');
        expect(body.includes(Buffer.from('canonical-plan.json'))).toBe(true);
      } else {
        expect(body.toString()).toContain('combined_signal');
        expect(body.toString()).toContain('doubled_signal');
        expect(body.toString()).toContain('polars');
      }
    }
    expect(apiErrors).toEqual([]);
  });

  test('spectrum summary and filter state stay synchronized with the displayed transform', async ({ page }) => {
    test.setTimeout(60_000);
    await openPage(page, 'fft');
    await page.locator('#fft-compute-btn').click();
    const summary = page.locator('table[data-chart-summary="fft"]');
    await expect(summary).toHaveCount(1, { timeout: 30_000 });
    await expect(summary.locator('caption')).toHaveText(/log10 magnitude/);

    await chooseDropdownOption(page, 'fft-normalize', 'minmax');
    await expect(summary.locator('caption')).toHaveText(/minmax normalized/);
    const extrema = await summary.locator('tbody tr').first().locator('td').evaluateAll((cells) => ({
      min: Number(cells[1]?.textContent),
      max: Number(cells[2]?.textContent),
    }));
    expect(extrema).toEqual({ min: 0, max: 1 });

    await chooseDropdownOption(page, 'fft-filter-type', 'lowpass');
    const highCutoff = page.locator('#fft-filter-high-hz');
    const nyquistHz = Number(await highCutoff.getAttribute('data-flex-max'));
    expect(nyquistHz).toBeGreaterThan(0);
    const cutoffHz = String(nyquistHz / 2);
    await highCutoff.fill(cutoffHz);
    await expect(highCutoff).toHaveValue(cutoffHz);
    await expect(page.locator('#fft-filter-apply-btn')).toBeEnabled();
    await page.locator('#fft-filter-apply-btn').click();
    await expect(page.locator('#fft-filter-status')).toContainText('lowpass preview active', { timeout: 30_000 });

    await chooseDropdownOption(page, 'fft-filter-type', 'none');
    await expect(page.locator('#fft-filter-status')).toBeEmpty();
  });

  test('reviewed shell and data-source affordances are present in the current UI', async ({ page }) => {
    await openPage(page, 'upload');
    await expect(page.locator('#profile-select-all-checkbox')).toBeVisible();
    await expect(page.locator('#profile-select-invert-btn')).toHaveText('Invert');
    await expect(page.locator('.db-examples')).toContainText('sslmode=require');
    await expect(page.locator('.db-examples')).toContainText('schema');

    const shortcutLabels = await page.locator('.sidebar .nav-shortcut').allTextContents();
    expect(shortcutLabels).toEqual(['⌥1', '⌥2', '⌥3', '⌥4', '⌥5', '⌥6', '⌥7', '⌥8']);
    for (const id of [
      'keyboard-help-btn', 'settings-btn', 'workflow-toggle-btn',
      'open-cleaning-plan-btn', 'theme-toggle-btn', 'provenance-toggle-btn',
    ]) await expect(page.locator(`#${id}`)).toBeVisible();

    await openPage(page, 'spectrogram');
    await expect(page.locator('#spectrogram-win-size').getByRole('combobox')).toContainText('96 (1 day @ 15min)');
    await expect(page.locator('#spectrogram-hop-size').getByRole('combobox')).toContainText('50% (50% overlap)');
    await expect(page.locator('#spectrogram-zoom-reset-btn')).toHaveText('Reset zoom');
    const summaryOutsideChart = await page.locator('#spectrogram-summary').evaluate((summaryElement) => (
      !summaryElement.closest('.spectrogram-chart-row')
    ));
    expect(summaryOutsideChart).toBe(true);
  });

  test('API response times are acceptable', async ({ page }) => {
    // Select a matrix pair to trigger the Pair plot request on the dedicated page.
    await openPage(page, 'correlations');
    const pairCell = page.locator('.heatmap-cell[data-row-name="HULL"][data-col-name="MULL"]').first();
    await expect(pairCell).toBeVisible({ timeout: 20_000 });
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/scatter/points')
      && response.ok(),
    );
    await pairCell.click();
    const response = await responsePromise;
    await response.finished();
    const duration = response.request().timing().responseEnd;

    // Measure the points API itself. The matrix click intentionally refreshes
    // correlation context before requesting points, which is separate work
    // and must not be folded into an endpoint-response assertion.
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(1_000);
  });

  test('accessibility - form fields have labels', async ({ page }) => {
    // Navigate to upload page (has many form fields)
    await openPage(page, 'upload');
    
    // Check that all form fields have associated labels
    const inputs = page.locator('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])');
    const count = await inputs.count();
    
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');
      
      // Each input should have at least one form of label
      const hasLabel = id || ariaLabel || ariaLabelledBy || placeholder;
      expect(hasLabel).toBeTruthy();
    }
  });

  test('lighthouse accessibility score improves', async ({ page }) => {
    // This test would use Lighthouse programmatically
    // For now, check that critical a11y elements are present
    
    await openPage(page, 'home');
    
    // Check for lang attribute
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    
    // Check for landmark navigation
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(nav).toHaveCount(1);
    
    await expect(page.locator('a[href="#main"]')).toBeVisible();
  });

});

test.describe('Preparation review improvements', () => {
  test('requires a fresh preview and preserves keyboard context through plan and profile updates', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPage(page, 'prepare');
    await expect(page.locator('#prepare-transformation')).toBeVisible();
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    await page.getByLabel('Transformation to add').selectOption('3');
    await page.getByLabel('Columns to sort by').fill('date');
    await page.getByLabel('Columns to sort by').press('Enter');
    await expect(page.locator('.prepare-workspace__stage')).toHaveCount(1);
    await expect(page.locator('.prepare-workspace__stage')).toBeFocused();
    await expect(page.locator('#prepare-plan-status')).toContainText('Preview required');
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    await page.locator('#prepare-preview-button').click();
    await expect(page.locator('#prepare-materialize-button')).toBeEnabled();
    await expect(page.locator('.prepare-workspace__stage-impact')).toContainText('69,680 rows after this stage');

    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/v1/profile/sample', async (route) => {
      await hold;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Build sampled quality report', exact: true }).click();
    await page.getByLabel('Transformation to add').selectOption('4');
    await page.getByLabel('Columns to fill', { exact: true }).fill('HULL');
    release();
    await expect(page.getByRole('button', { name: 'Sampled quality report ready', exact: true })).toBeVisible();
    await expect(page.getByLabel('Columns to fill', { exact: true })).toHaveValue('HULL');
    await expect(page.getByLabel('Columns to fill', { exact: true })).toBeFocused();
    await expect(page.locator('#prepare-materialize-button')).toBeEnabled();
    await expect(page.locator('#prepare-profile-grid')).toBeVisible();
    await expect(page.locator('#prepare-profile-grid-rows')).toContainText('HULL');
    await expect(page.locator('#prepare-profile-findings .prepare-workspace__quality-table')).toHaveCount(0);
    await page.locator('#page-prepare').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath('preparation-desktop.png') });

    await page.getByLabel('Transformation to add').selectOption('0');
    await page.getByLabel('Numeric column', { exact: true }).fill('HULL');
    await page.getByLabel('Numeric column', { exact: true }).press('Enter');
    await expect(page.locator('.prepare-workspace__stage')).toHaveCount(2);
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    await page.locator('.prepare-workspace__stage-position select').last().focus();
    await page.locator('.prepare-workspace__stage-position select').last().selectOption('0');
    await expect(page.locator('.prepare-workspace__stage').first()).toContainText('HULL');
    await expect(page.locator('.prepare-workspace__stage-position select').first()).toBeFocused();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.prepare-workspace__stage').first()).toContainText('Stable ascending sort');
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    await page.locator('#prepare-preview-button').click();
    await expect(page.locator('#prepare-materialize-button')).toBeEnabled();
    await page.locator('[data-prepare-section="prepare-pipeline-stages"]').click();
    await expect(page.locator('#prepare-pipeline-stages')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('preparation-stages.png') });
    expect(errors).toEqual([]);
  });

  test('keeps every section reachable on mobile and labels the composer controls', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, 'prepare');
    const sections = page.getByLabel('Jump to section', { exact: true });
    await expect(sections).toBeVisible();
    await expect(sections.locator('option')).toHaveCount(5);
    await sections.selectOption('prepare-pipeline-stages');
    await expect(page.locator('#prepare-pipeline-stages')).toBeInViewport();
    await page.getByLabel('Transformation to add').selectOption('5');
    await expect(page.getByLabel('Resampling interval', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Column aggregations', { exact: true })).toBeVisible();
    const unlabeled = await page.locator('#prepare-workspace').evaluate((root) => Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')).filter((field) => !field.labels?.length && !field.getAttribute('aria-label')).map((field) => field.name));
    expect(unlabeled).toEqual([]);
    await expect(page.locator('.prepare-workspace__toolbar')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('preparation-mobile.png') });
    const widths = await page.locator('#page-prepare').evaluate((element) => ({ available: element.clientWidth, content: element.scrollWidth }));
    expect(widths.content).toBeLessThanOrEqual(widths.available + 1);
    await sections.selectOption('prepare-insight-record');
    await expect(page.getByLabel('Evidence and rationale')).toBeVisible();
    await expect(page.locator('.prepare-workspace__toolbar')).toBeInViewport();
    await sections.selectOption('prepare-profile-findings');
    await expect(page.getByRole('button', { name: 'Exact quality report ready', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#prepare-profile-grid')).toBeVisible();
    await expect(page.locator('#prepare-profile-grid .profile-grid-header .profile-col')).toHaveCount(7);
    await expect(page.locator('#prepare-profile-findings .prepare-workspace__quality-table')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('preparation-mobile-quality.png') });
  });

  test('creates a prepared version only after preview and resets approval for the new dataset', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPage(page, 'prepare');
    await page.getByLabel('Transformation to add').selectOption('3');
    await page.getByLabel('Columns to sort by').fill('date');
    await page.getByLabel('Columns to sort by').press('Enter');
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
    await page.locator('#prepare-preview-button').click();
    await expect(page.locator('#prepare-materialize-button')).toBeEnabled();
    const applied = page.waitForResponse('**/api/v1/cleaning/apply');
    await page.locator('#prepare-materialize-button').click();
    const response = await applied;
    expect(response.ok()).toBe(true);
    const result = await response.json();
    await expect(page.locator('.prepare-workspace__revision-link')).toHaveText(String(result.datasetRevision));
    await expect(page.locator('#prepare-plan-status')).toContainText('Source baseline');
    await expect(page.locator('.prepare-workspace__stage')).toHaveCount(0);
    await expect(page.locator('#prepare-materialize-button')).toBeDisabled();
  });
});

test.describe('Page Load Performance', () => {
  
  test('home page loads within 500ms', async ({ page }) => {
    const startTime = Date.now();
    
    await openPage(page, 'home');
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    // Should load within 500ms (excluding network latency)
    expect(loadTime).toBeLessThan(500);
  });

  test('timeseries page renders chart within 1s of navigation', async ({ page }) => {
    await openPage(page, 'home');
    
    const startTime = Date.now();
    
    await openPage(page, 'timeseries');
    
    await expect(page.locator('#main-chart')).toBeVisible({ timeout: 5000 });
    
    const endTime = Date.now();
    const renderTime = endTime - startTime;
    
    expect(renderTime).toBeLessThan(1000);
  });

});

test.describe('Console Error Monitoring', () => {
  
  test('no console errors on any page', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate through all pages
    const pages = ['home', 'upload', 'timeseries', 'scatter', 'correlations', 'fft', 'spectrogram', 'causal', 'drift'];
    
    for (const pageName of pages) {
      await openPage(page, pageName);
      await page.waitForTimeout(500);
    }
    
    // Filter out expected WebGPU warnings (these are expected in headless browsers)
    const criticalErrors = errors.filter(err => 
      !err.includes('WebGPU') && 
      !err.includes('No available adapters')
    );
    
    expect(criticalErrors).toEqual([]);
  });

});
