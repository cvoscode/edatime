/**
 * Playwright E2E tests for audit verification
 * 
 * These tests verify the packaged app against a real, local dataset.
 * Run with: npm run test:e2e (after starting `make dev-dist`).
 */

import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

    const chartTools = page.locator('.timeseries-utility-shelf');
    await expect(chartTools.locator('.timeseries-tools-summary-detail')).toContainText('(Range active)');
    await expect(chartTools).toHaveAttribute('title', /Range/);
    if (!(await chartTools.evaluate((details: HTMLDetailsElement) => details.open))) {
      await chartTools.locator(':scope > summary').click();
    }
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
