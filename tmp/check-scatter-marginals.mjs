import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const failures = [];

try {
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 30000 });

    const scatterNav = page.locator('[data-page="scatter"]');
    await scatterNav.click();
    await page.waitForSelector('#page-scatter:not([hidden])', { timeout: 30000 });

    await page.waitForTimeout(1000);

    const xSelect = page.locator('#scatter-x-col');
    const ySelect = page.locator('#scatter-y-col');
    let xValue = await xSelect.inputValue();
    let yValue = await ySelect.inputValue();

    if (!xValue) {
        const first = await xSelect.locator('option').nth(1).getAttribute('value');
        if (first) {
            await xSelect.selectOption(first);
            xValue = first;
        }
    }
    if (!yValue) {
        const options = await ySelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value') || ''));
        const next = options.find((value) => value && value !== xValue);
        if (next) {
            await ySelect.selectOption(next);
            yValue = next;
        }
    }

    await page.waitForTimeout(2000);

    async function captureMode(label) {
        return await page.evaluate((tag) => {
            function canvasInfo(id) {
                const canvas = document.getElementById(id);
                if (!(canvas instanceof HTMLCanvasElement)) return null;
                const rect = canvas.getBoundingClientRect();
                const style = getComputedStyle(canvas);
                let nonZeroAlpha = 0;
                let sample = null;
                try {
                    const ctx = canvas.getContext('2d');
                    if (ctx && canvas.width > 0 && canvas.height > 0) {
                        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const pixels = image.data;
                        for (let i = 3; i < pixels.length; i += 4) {
                            if (pixels[i] > 0) nonZeroAlpha++;
                        }
                        sample = Array.from(pixels.slice(0, 32));
                    }
                } catch (error) {
                    sample = { error: String(error) };
                }
                return {
                    hiddenAttr: canvas.hidden,
                    width: canvas.width,
                    height: canvas.height,
                    clientWidth: canvas.clientWidth,
                    clientHeight: canvas.clientHeight,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    display: style.display,
                    visibility: style.visibility,
                    nonZeroAlpha,
                    sample,
                };
            }

            const chart = document.getElementById('scatter-chart');
            const rightPanel = document.getElementById('scatter-right-panel');
            return {
                tag,
                location: window.location.href,
                title: document.title,
                renderMode: (document.getElementById('scatter-render-mode') instanceof HTMLSelectElement)
                    ? document.getElementById('scatter-render-mode').value
                    : null,
                diagonalMode: (document.getElementById('scatter-diagonal-mode') instanceof HTMLSelectElement)
                    ? document.getElementById('scatter-diagonal-mode').value
                    : null,
                xValue: (document.getElementById('scatter-x-col') instanceof HTMLSelectElement) ? document.getElementById('scatter-x-col').value : null,
                yValue: (document.getElementById('scatter-y-col') instanceof HTMLSelectElement) ? document.getElementById('scatter-y-col').value : null,
                pageScatterHidden: (document.getElementById('page-scatter') instanceof HTMLElement) ? document.getElementById('page-scatter').hidden : null,
                chartRect: chart ? chart.getBoundingClientRect().toJSON() : null,
                chartClass: chart?.className || null,
                rightPanelHidden: (rightPanel instanceof HTMLElement) ? rightPanel.hidden : null,
                rightPanelData: (rightPanel instanceof HTMLElement) ? rightPanel.dataset.marginalActive : null,
                marginalX: canvasInfo('scatter-marginal-x'),
                marginalY: canvasInfo('scatter-marginal-y'),
                errorText: document.getElementById('scatter-error')?.textContent || null,
            };
        }, label);
    }

    function assertMode(label, payload) {
        const fail = (msg) => failures.push(`[${label}] ${msg}`);
        if (payload.marginalX?.hiddenAttr) fail('marginalX.hidden should be false');
        if (payload.marginalY?.hiddenAttr) fail('marginalY.hidden should be false');
        if (!(payload.marginalX?.nonZeroAlpha > 0)) fail(`marginalX nonZeroAlpha should be > 0 (got ${payload.marginalX?.nonZeroAlpha})`);
        if (!(payload.marginalY?.nonZeroAlpha > 0)) fail(`marginalY nonZeroAlpha should be > 0 (got ${payload.marginalY?.nonZeroAlpha})`);
        if (payload.rightPanelHidden) fail('rightPanel should be visible (marginal active)');
        if (payload.rightPanelData !== '1') fail('rightPanel data-marginal-active should be "1"');
        if (!payload.chartClass?.includes('with-x-marginal')) fail('chart should have .with-x-marginal class');
        if (payload.errorText) fail(`scatter-error should be empty (got "${payload.errorText}")`);
        // Y-marginal canvas top should align with chart canvas top so the
        // y-marginal's plot region matches the chart's plot region vertically.
        const yTop = payload.marginalY?.rect?.y ?? null;
        const chartTop = payload.chartRect?.top ?? null;
        if (yTop !== null && chartTop !== null && Math.abs(yTop - chartTop) > 1) {
            fail(`y-marginal top (${yTop}) should align with chart top (${chartTop})`);
        }
    }

    // Pass 1: scatter mode (existing behavior).
    const renderModeSelect = page.locator('#scatter-render-mode');
    await renderModeSelect.selectOption('scatter');
    await page.waitForTimeout(800);
    const scatterData = await captureMode('scatter');
    assertMode('scatter', scatterData);
    await page.screenshot({ path: 'tmp/scatter-browser-check.png', fullPage: true });

    // Pass 2: density mode (new behavior — marginals must still render).
    await renderModeSelect.selectOption('density');
    await page.waitForTimeout(800);
    const densityData = await captureMode('density');
    assertMode('density', densityData);
    await page.screenshot({ path: 'tmp/scatter-browser-check-density.png', fullPage: true });

    const report = {
        scatter: scatterData,
        density: densityData,
        failures,
    };
    console.log(JSON.stringify(report, null, 2));

    if (failures.length > 0) {
        console.error(`\nFAILED: ${failures.length} assertion(s) did not hold.`);
        process.exitCode = 1;
    } else {
        console.error('\nOK: marginals render in both scatter and density modes.');
    }
} finally {
    await browser.close();
}
