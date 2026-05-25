import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[console] [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`[pageerror] ${err.message}`));
  page.on('requestfailed', request => {
    console.error(`[network] request failed: ${request.url()} - ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    if (!response.ok()) {
      console.error(`[network] non-ok response: ${response.url()} - ${response.status()}`);
    }
  });
  
  try {
    await page.goto('http://localhost:3000/#/timeseries', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 4000));
    
    const chartInfo = await page.evaluate(() => {
      const container = document.querySelector('.chart-container');
      if (!container) return "No chart container found. Body: " + document.body.innerHTML.substring(0, 500);
      return {
        status: container.getAttribute('data-status'),
        canvasPresent: !!container.querySelector('canvas'),
      };
    });
    console.log("Chart info:", chartInfo);
  } catch(e) {
    console.error("Failed to load page:", e);
  } finally {
    await browser.close();
  }
})();
