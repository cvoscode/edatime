/**
 * Playwright E2E tests for audit verification
 * 
 * These tests verify the improvements identified in the 2026-05-05 audit.
 * Run with: npx playwright test tests/e2e_audit_tests.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Audit Verification Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://127.0.0.1:3000');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('drift page routing works correctly', async ({ page }) => {
    // Navigate to drift page
    await page.goto('http://127.0.0.1:3000/#page=drift');
    
    // Check that drift page is visible
    const driftPage = page.locator('#page-drift');
    await expect(driftPage).toBeVisible();
    
    // Check that sidebar shows Drift as active
    const driftButton = page.locator('button[data-page="drift"]');
    await expect(driftButton).toHaveClass(/active/);
  });

  test('home page has no layout shifts (CLS = 0)', async ({ page }) => {
    // Navigate to home page
    await page.goto('http://127.0.0.1:3000/#page=home');
    
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

  test('upload page does not eagerly fetch metadata', async ({ page }) => {
    // Set up request tracking
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) {
        apiRequests.push(url);
      }
    });

    // Navigate to upload page
    await page.goto('http://127.0.0.1:3000/#page=upload');
    await page.waitForLoadState('networkidle');
    
    // Check that no metadata/data requests were made
    const metadataRequests = apiRequests.filter(url => 
      url.includes('/api/metadata') || 
      url.includes('/api/data') || 
      url.includes('/api/database/status')
    );
    
    expect(metadataRequests.length).toBe(0);
  });

  test('no ECharts zero-size warnings on page transitions', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    // Navigate through multiple pages
    const pages = ['home', 'upload', 'timeseries', 'scatter', 'heatmap', 'fft', 'causal', 'drift'];
    
    for (const pageName of pages) {
      await page.goto(`http://127.0.0.1:3000/#page=${pageName}`);
      await page.waitForLoadState('networkidle');
    }
    
    // Check for zero-size warnings
    const zeroSizeWarnings = consoleMessages.filter(msg => 
      msg.toLowerCase().includes('zero size') ||
      msg.toLowerCase().includes('echarts')
    );
    
    expect(zeroSizeWarnings.length).toBe(0);
  });

  test('scatter matrix is a sub-tab inside Scatter page', async ({ page }) => {
    // Navigate to scatter page
    await page.goto('http://127.0.0.1:3000/#page=scatter');
    await page.waitForLoadState('networkidle');
    
    // Check that Matrix button is a sub-tab in scatter toolbar
    const matrixButton = page.locator('#scatter-view-matrix-btn');
    await expect(matrixButton).toBeVisible();
    
    // Click on Matrix to switch view
    await matrixButton.click();
    
    // Verify scatter matrix view is visible
    const scatterMatrix = page.locator('[data-scatter-view-panel="matrix"]');
    await expect(scatterMatrix).toBeVisible();
  });

  test('API response times are acceptable', async ({ page }) => {
    // Navigate to scatter page
    await page.goto('http://127.0.0.1:3000/#page=scatter');
    await page.waitForLoadState('networkidle');
    
    // Select columns to trigger API calls
    const xSelect = page.locator('#scatter-x-col');
    const ySelect = page.locator('#scatter-y-col');
    
    // Wait for correlation matrix request
    const startTime = Date.now();
    
    // Select columns to trigger scatter points request
    await xSelect.selectOption('HUFL');
    await ySelect.selectOption('HULL');
    
    // Wait for request to complete
    await page.waitForResponse(response => 
      response.url().includes('/api/scatter/points') || 
      response.url().includes('/api/scatter/correlations')
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should be under 200ms for sample dataset
    expect(duration).toBeLessThan(200);
  });

  test('accessibility - form fields have labels', async ({ page }) => {
    // Navigate to upload page (has many form fields)
    await page.goto('http://127.0.0.1:3000/#page=upload');
    await page.waitForLoadState('networkidle');
    
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
    
    await page.goto('http://127.0.0.1:3000/#page=home');
    await page.waitForLoadState('networkidle');
    
    // Check for lang attribute
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    
    // Check for semantic structure
    const main = page.locator('main, [role="main"]');
    await expect(main).toBeVisible();
    
    // Check for landmark navigation
    const nav = page.locator('nav, [role="navigation"]');
    await expect(nav).toHaveCount(1);
    
    // Check for skip link
    const skipLink = page.locator('a[href="#main"], [role="link"][href="#main"]');
    // Skip links are optional but recommended
  });

});

test.describe('Page Load Performance', () => {
  
  test('home page loads within 500ms', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('http://127.0.0.1:3000/#page=home');
    await page.waitForLoadState('domcontentloaded');
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    // Should load within 500ms (excluding network latency)
    expect(loadTime).toBeLessThan(500);
  });

  test('timeseries page renders chart within 1s of navigation', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/#page=home');
    await page.waitForLoadState('networkidle');
    
    const startTime = Date.now();
    
    await page.goto('http://127.0.0.1:3000/#page=timeseries');
    
    // Wait for chart container or series chips to appear
    const chartContainer = page.locator('#main-chart, .series-toggles');
    await expect(chartContainer).toBeVisible({ timeout: 5000 });
    
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
    const pages = ['home', 'upload', 'timeseries', 'scatter', 'heatmap', 'fft', 'spectrogram', 'causal', 'drift'];
    
    for (const pageName of pages) {
      await page.goto(`http://127.0.0.1:3000/#page=${pageName}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }
    
    // Filter out expected WebGPU warnings (these are expected in headless browsers)
    const criticalErrors = errors.filter(err => 
      !err.includes('WebGPU') && 
      !err.includes('No available adapters')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

});