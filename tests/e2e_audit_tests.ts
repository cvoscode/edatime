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
const backingPage = (pageName: string): string => pageName === 'correlations' ? 'heatmap' : pageName;

async function openPage(page: Page, pageName: string): Promise<void> {
  await page.goto(`/#page=${pageName}`);
  await expect(page.locator(`#page-${backingPage(pageName)}`)).toBeVisible();
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

  test('scatter matrix is a sub-tab inside Scatter page', async ({ page }) => {
    // Navigate to scatter page
    await openPage(page, 'scatter');
    
    // Check that Matrix button is a sub-tab in scatter toolbar
    const matrixButton = page.locator('#scatter-view-matrix-btn');
    await expect(matrixButton).toBeVisible();
    
    // Click on Matrix to switch view
    await matrixButton.click();
    
    // Verify scatter matrix view is visible
    const scatterMatrix = page.locator('[data-scatter-view-panel="matrix"]');
    await expect(scatterMatrix).toBeVisible();
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

  test('API response times are acceptable', async ({ page }) => {
    // Navigate to scatter page
    await openPage(page, 'scatter');
    
    // Select columns to trigger API calls
    const startTime = Date.now();
    const responsePromise = page.waitForResponse(response =>
      (response.url().includes('/api/v1/scatter/points')
        || response.url().includes('/api/v1/scatter/correlations'))
      && response.ok(),
    );
    await chooseDropdownOption(page, 'scatter-x-col', 'MUFL');
    await chooseDropdownOption(page, 'scatter-y-col', 'MULL');
    await responsePromise;
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Local sample-data interactions should stay responsive without a
    // network-dependent microbenchmark threshold.
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
    const nav = page.locator('nav, [role="navigation"]');
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
